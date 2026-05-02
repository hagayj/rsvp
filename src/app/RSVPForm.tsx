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


  return (
    <div className="w-full max-w-md mx-auto relative z-10" dir="rtl">
      {/* Invitation Image Header */}
      <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl shadow-green-900/10 border border-white/50 mb-8 overflow-hidden transform hover:scale-[1.01] transition-all duration-500">
        <img 
          src="/invitation_v2.jpg" 
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
            <div className="text-right flex-1 pt-0.5">
              <p className="font-bold text-lg leading-tight">יום ו', 5 ביוני 2026</p>
              <p className="text-sm text-slate-500 font-medium mt-1">התכנסות החל מהשעה 20:00</p>
            </div>
          </div>

          <div className="text-right pr-12 py-1">
            <p className="text-purple-600 font-extrabold text-base">תחילת מסיבה בשעה 21:00</p>
          </div>

          <div className="flex items-start gap-3">
             <div className="bg-amber-100 p-2.5 rounded-xl text-amber-700">
              <MapPin className="w-6 h-6" />
            </div>
            <div className="text-right flex-1 pt-0.5">
              <p className="font-bold text-lg leading-tight">מוזיאון הטרקטור במושב עין ורד</p>
              <p className="text-xs text-slate-500 font-medium italic mt-1">הזמנה אישית/זוגית ולא ניתנת להעברה</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-2">
            <a 
              href="#"
              onClick={(e) => {
                e.preventDefault();
                const query = 'מוזיאון הטרקטור בעין ורד';
                const universalUrl = `https://waze.com/ul?q=${encodeURIComponent(query)}`;
                const androidIntentUrl = `intent://waze.com/ul?q=${encodeURIComponent(query)}#Intent;scheme=https;package=com.waze;end`;
                if (/Android/i.test(navigator.userAgent)) {
                  window.location.href = androidIntentUrl;
                } else {
                  window.location.href = universalUrl;
                }
              }}
              className="flex items-center justify-center gap-3 w-full py-4 bg-[#33CCFF] text-white text-base font-bold rounded-2xl shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
            >
              <span>ניווט בוויז</span>
              <img src="https://pngimg.com/uploads/waze/waze_PNG40.png" className="w-6 h-6" alt="Waze" />
            </a>
            
            <div className="flex gap-3">
              <a 
                href={`https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent("יום הולדת 80 לעמיר ז'ביליק 🚜")}&details=${encodeURIComponent(`נשמח לראותכם! לפרטים ואישור הגעה: ${typeof window !== 'undefined' ? window.location.origin : ''}/?id=${id}`)}&location=${encodeURIComponent("מוזיאון הטרקטור בעין ורד")}&dates=20260605T170000Z/20260605T210000Z`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-4 bg-[#4285F4] text-white text-sm font-bold rounded-2xl shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
              >
                <span>יומן Google</span>
                <img src="https://www.gstatic.com/images/branding/product/1x/calendar_2020q4_48dp.png" className="w-5 h-5" alt="Google Calendar" />
              </a>

              <a 
                href={`/api/calendar?id=${id}`}
                className="flex-1 flex items-center justify-center gap-2 py-4 bg-green-600 text-white text-sm font-bold rounded-2xl shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
              >
                <span>יומן Apple</span>
                <BellPlus className="w-5 h-5" />
              </a>
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
