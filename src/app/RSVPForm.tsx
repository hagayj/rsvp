/* eslint-disable */
"use client";
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CheckCircle2, ChevronDown, PartyPopper, CalendarDays, MapPin, BellPlus } from 'lucide-react';

type STATUS = 'pending' | 'attending' | 'declined';

interface RSVPFormProps {
  id: string;
  name: string;
  initialStatus: STATUS;
  initialGuests: number;
}

export default function RSVPForm({ id, name, initialStatus, initialGuests }: RSVPFormProps) {
  const [status, setStatus] = useState<STATUS>(initialStatus === 'pending' ? 'attending' : initialStatus);
  const [guests, setGuests] = useState<number>(initialGuests > 0 ? initialGuests : 1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(initialStatus !== 'pending');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const { error } = await supabase
      .from('guests')
      .update({ 
        status, 
        guests_count: status === 'attending' ? guests : 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (!error) {
      setIsSuccess(true);
    } else {
      alert("אירעה שגיאה. נסה שוב מאוחר יותר.");
    }
    
    setIsSubmitting(false);
  };

  const generateICS = () => {
    // Event times in UTC (Israel Summer Time is UTC+3)
    // June 5, 2026, 20:00 IDT -> 17:00 UTC
    // June 6, 2026, 00:00 IDT -> 21:00 UTC
    const title = "יום הולדת 80 לעמיר ז'ביליק 🚜";
    const description = `נשמח לראותכם! לפרטים ואישור הגעה: ${window.location.origin}${window.location.pathname}?id=${id}`;
    const location = "מוזיאון הטרקטור בעין ורד";
    const start = "20260605T170000Z";
    const end = "20260605T210000Z";

    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${location}`,
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\n");

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    return URL.createObjectURL(blob);
  };

  return (
    <div className="w-full max-w-md mx-auto relative z-10" dir="rtl">
      {/* Invitation Image Header */}
      <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl shadow-green-900/10 border border-white/50 mb-8 overflow-hidden transform hover:scale-[1.01] transition-all duration-500">
        <img 
          src="/invetation.jpeg" 
          alt="הזמנה ליום הולדת 80" 
          className="w-full h-auto object-cover"
        />
      </div>

      {/* Quick Details Card */}
      <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl shadow-green-900/10 border border-white/50 p-6 mb-8 text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl"></div>
        
        <div className="flex flex-col gap-4 text-slate-700">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-2.5 rounded-xl text-green-700">
              <CalendarDays className="w-6 h-6" />
            </div>
            <div className="text-right">
              <p className="font-bold text-lg">יום ו', 5 ביוני 2026</p>
              <div className="text-sm text-slate-500 font-medium leading-tight mt-1">
                <p>התכנסות החל מהשעה 20:00</p>
                <p>תחילת מסיבה בשעה 21:00</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <div className="bg-amber-100 p-2.5 rounded-xl text-amber-700">
              <MapPin className="w-6 h-6" />
            </div>
            <div className="text-right flex-1">
              <p className="font-bold text-lg">מוזיאון הטרקטור במושב עין ורד</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-slate-500 font-medium italic">הזמנה אישית/זוגית ולא ניתנת להעברה</p>
                <a 
                  href="https://waze.com/ul?q=מוזיאון%20הטרקטור%20בשדה%20ורד" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#33CCFF] text-white text-[11px] font-bold rounded-full hover:shadow-lg hover:bg-[#2bb8e6] transition-all active:scale-95"
                >
                  ניווט ליעד
                  <img src="https://pngimg.com/uploads/waze/waze_PNG40.png" className="w-4 h-4" alt="Waze" />
                </a>
                <a 
                  href={typeof window !== 'undefined' ? generateICS() : '#'}
                  download="amir-birthday-80.ics"
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-600 text-white text-[11px] font-bold rounded-full hover:shadow-lg hover:bg-green-700 transition-all active:scale-95"
                >
                  הוספה ליומן
                  <BellPlus className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl shadow-purple-900/10 border border-white p-8 relative">
        {isSuccess ? (
          <div className="text-center animate-in fade-in zoom-in duration-500">
            <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">
              {status === 'attending' ? 'נהדר, מחכים לראותך!' : 'חבל, נשמח פעם הבאה!'}
            </h2>
            <p className="text-slate-600 mb-8">
              התשובה פה שמורה אצלנו.
              {status === 'attending' && <span className="block mt-1">רשמנו שמגיעים {guests} אורחים.</span>}
            </p>
            
            <button 
              onClick={() => setIsSuccess(false)}
              className="text-purple-600 font-medium text-sm hover:underline"
            >
              רוצה לשנות את התשובה? לחץ כאן.
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="animate-in fade-in duration-300">
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <span className="text-xl">👋</span> היי {name},
            </h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-3">
                  האם תגיעו לחגוג איתנו?
                </label>
                <div className="flex gap-4">
                  <label className={`flex-1 border-2 rounded-2xl p-4 cursor-pointer transition-all ${status === 'attending' ? 'border-purple-600 bg-purple-50 text-purple-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                    <input 
                      type="radio" 
                      name="status" 
                      value="attending"
                      className="hidden"
                      checked={status === 'attending'}
                      onChange={() => setStatus('attending')}
                    />
                    <div className="text-center font-bold text-lg">בטח שמגיעים 🎉</div>
                  </label>
                  
                  <label className={`flex-1 border-2 rounded-2xl p-4 cursor-pointer transition-all ${status === 'declined' ? 'border-slate-400 bg-slate-100 text-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                    <input 
                      type="radio" 
                      name="status" 
                      value="declined"
                      className="hidden"
                      checked={status === 'declined'}
                      onChange={() => setStatus('declined')}
                    />
                    <div className="text-center font-bold text-lg">לא יתאפשר 😥</div>
                  </label>
                </div>
              </div>

              {status === 'attending' && (
                <div className="animate-in slide-in-from-top-4 fade-in duration-300">
                  <label className="block text-sm font-semibold text-slate-700 mb-3">
                    למי לשריין פה מקום?
                  </label>
                  <div className="relative">
                    <select 
                      className="w-full appearance-none bg-slate-50 border-2 border-slate-200 text-slate-800 font-bold rounded-2xl p-4 pr-4 pl-12 focus:outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-600/10 transition-all cursor-pointer"
                      value={guests}
                      onChange={(e) => setGuests(Number(e.target.value))}
                    >
                      <option value="1">אני מגיע/ה לבד (1)</option>
                      <option value="2">אנחנו זוג (2)</option>
                    </select>
                    <ChevronDown className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none w-5 h-5" />
                  </div>
                </div>
              )}

              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-gradient-to-r from-green-600 to-lime-600 text-white font-bold text-lg rounded-2xl py-4 shadow-lg shadow-green-600/30 hover:shadow-green-600/50 transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 disabled:transform-none transition-all"
              >
                {isSubmitting ? 'מעדכן את עמיר...' : 'אישור השתתפות'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
