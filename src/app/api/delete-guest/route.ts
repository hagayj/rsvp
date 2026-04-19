import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const { id, name } = await request.json();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // Perform deletion bypassing RLS
    const { error } = await supabaseAdmin
      .from('guests')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Deletion error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log the action to system_logs for visibility
    await supabaseAdmin.from('system_logs').insert({
      message: `[CLOUD API] ${name || 'אורח'} נמחק בהצלחה (Instant Deletion)`,
      level: 'success'
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('API Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
