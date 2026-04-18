/* eslint-disable */
import { supabase } from '@/lib/supabase';
import RSVPForm from './RSVPForm';

// NextJS 15 requires awaiting searchParams
export default async function Home(props: { searchParams: Promise<{ id?: string }> }) {
  const searchParams = await props.searchParams;
  const id = searchParams.id;

  if (!id) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 text-center" dir="rtl">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 max-w-sm w-full">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">אופס! 🧐</h1>
          <p className="text-slate-500">הקישור חסר או לא תקין.<br/>נא להשתמש בקישור האישי שנשלח בוואטסאפ.</p>
        </div>
      </main>
    );
  }

  // Fetch from Supabase using the ID
  const { data: guest, error } = await supabase
    .from('guests')
    .select('*')
    .eq('unique_code', id)
    .single();

  if (error || !guest) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 text-center" dir="rtl">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 max-w-sm w-full">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">לא נמצא 🚫</h1>
          <p className="text-slate-500">לא הצלחנו לאתר את ההזמנה שלך במערכת. ייתכן שהקישור שגוי.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen relative overflow-hidden bg-gradient-to-br from-[#fdfde7] via-white to-[#e7f5e7] p-4 pt-12 md:p-12 flex items-center justify-center font-sans" dir="rtl">
      {/* Background decorations */}
      <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-green-200/30 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] left-[-5%] w-96 h-96 bg-yellow-200/30 rounded-full blur-[100px] pointer-events-none"></div>
      
      <RSVPForm 
        id={guest.id} 
        name={guest.name} 
        initialStatus={guest.status} 
        initialGuests={guest.guests_count} 
      />
    </main>
  );
}
