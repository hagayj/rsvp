"use client";
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Loader2 } from 'lucide-react';

export default function PhoneSearch() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Normalize phone: keep only digits
    let cleanPhone = phone.replace(/\D/g, '');
    
    // Add prefix if it's a local Israeli number
    if (cleanPhone.startsWith('05')) {
      cleanPhone = '972' + cleanPhone.slice(1);
    } else if (cleanPhone.startsWith('5')) {
      cleanPhone = '972' + cleanPhone;
    }

    try {
      const { data, error: sbError } = await supabase
        .from('guests')
        .select('unique_code')
        .or(`phone.eq.${cleanPhone},phone.eq.+${cleanPhone}`)
        .single();

      if (sbError || !data) {
        setError('לא מצאנו הזמנה למספר הזה. וודא שהקלדת נכון.');
      } else {
        // Redirect to the correct URL
        window.location.href = `/?id=${data.unique_code}`;
      }
    } catch (err) {
      setError('אירעה שגיאה בחיפוש. נסה שוב.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto bg-white p-8 rounded-3xl shadow-xl border border-slate-100 text-center animate-in fade-in zoom-in duration-500">
      <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
        <Search className="w-8 h-8 text-blue-600" />
      </div>
      
      <h1 className="text-2xl font-bold text-slate-800 mb-2">מצא את ההזמנה שלך</h1>
      <p className="text-slate-500 mb-8 text-sm">
        הקישור לא עובד? אין בעיה.<br/>הכנס את מספר הטלפון שלך למטה:
      </p>

      <form onSubmit={handleSearch} className="space-y-4">
        <div className="relative">
          <input
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="לדוגמא: 0501234567"
            className="w-full px-4 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-center font-bold text-lg outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
          />
        </div>

        {error && <p className="text-red-500 text-xs font-bold">{error}</p>}

        <button
          type="submit"
          disabled={loading || !phone}
          className="w-full bg-blue-600 text-white font-bold text-lg rounded-2xl py-4 shadow-lg shadow-blue-600/30 hover:shadow-blue-600/50 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'חפש את ההזמנה שלי'}
        </button>
      </form>
      
      <p className="mt-8 text-xs text-slate-400">
        נתקלת בבעיה? צור קשר עם מארגני האירוע.
      </p>
    </div>
  );
}
