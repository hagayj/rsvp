/* eslint-disable */
import { supabase } from '@/lib/supabase';
import RSVPForm from './RSVPForm';
import PhoneSearch from './PhoneSearch';

// NextJS 15 requires awaiting searchParams
export default async function Home(props: { searchParams: Promise<{ id?: string }> }) {
  const searchParams = await props.searchParams;
  const id = searchParams.id;

  if (!id) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
        <PhoneSearch />
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
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 flex-col gap-6" dir="rtl">
        <div className="bg-red-50 text-red-700 px-6 py-3 rounded-2xl border border-red-100 text-sm font-bold">
          לא מצאנו הזמנה עם הקוד הזה. נסה לחפש לפי טלפון למטה:
        </div>
        <PhoneSearch />
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
