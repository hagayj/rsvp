/* eslint-disable */
"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Lock, CheckCircle2, XCircle, HelpCircle, Search, MessageSquareShare, Send, Terminal, Wifi, WifiOff } from 'lucide-react';

interface Guest {
  id: string;
  name: string;
  phone: string;
  status: 'pending' | 'attending' | 'declined';
  guests_count: number;
  unique_code: string;
  updated_at: string;
  last_reminder_at: string | null;
}

interface LogEntry {
  id: string;
  message: string;
  level: string;
  created_at: string;
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [guests, setGuests] = useState<Guest[]>([]);
  const [filter, setFilter] = useState<'all' | 'attending' | 'declined' | 'pending'>('all');
  const [loading, setLoading] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of logs
  useEffect(() => {
    if (showLogs) logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, showLogs]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'amir2026') {
      setIsAuthenticated(true);
    } else {
      alert('סיסמה שגויה!');
    }
  };

  const fetchGuests = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('guests')
      .select('*')
      .order('updated_at', { ascending: false });
    
    if (data) setGuests(data as Guest[]);
    setLoading(false);
  }, []);

  const checkWorkerStatus = useCallback(async () => {
    const { data } = await supabase
      .from('system_settings')
      .select('value, updated_at')
      .eq('key', 'worker_heartbeat')
      .single();

    if (data) {
      const lastSeen = new Date(data.updated_at);
      const diffSeconds = (Date.now() - lastSeen.getTime()) / 1000;
      setWorkerOnline(diffSeconds < 60);
    } else {
      setWorkerOnline(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    const { data } = await supabase
      .from('system_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (data) setLogs(data.reverse() as LogEntry[]);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    
    fetchGuests();
    checkWorkerStatus();
    fetchLogs();

    // Poll worker status every 30s
    const statusInterval = setInterval(checkWorkerStatus, 30000);

    // Subscribe to live logs
    const logsChannel = supabase
      .channel('live-logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'system_logs' },
        (payload) => {
          setLogs(prev => [...prev.slice(-49), payload.new as LogEntry]);
          setShowLogs(true); // auto-open log panel when there's activity
        }
      )
      .subscribe();

    // Subscribe to heartbeat changes
    const heartbeatChannel = supabase
      .channel('heartbeat')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'system_settings' },
        (payload) => {
          if (payload.new.key === 'worker_heartbeat') {
            const val = payload.new.value as { status: string };
            setWorkerOnline(val?.status === 'online');
          }
        }
      )
      .subscribe();

    // Subscribe to job status changes
    const jobsChannel = supabase
      .channel('job-status')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs' },
        (payload) => {
          const job = payload.new as { status: string };
          if (job.status === 'completed') {
            setIsTriggering(false);
            setJobStatus(null);
            fetchGuests();
          } else if (job.status === 'processing') {
            setJobStatus('המחשב בבית שולח הודעות...');
          } else if (job.status === 'failed') {
            setIsTriggering(false);
            setJobStatus('שגיאה! בדוק את הלוגים');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(logsChannel);
      supabase.removeChannel(heartbeatChannel);
      supabase.removeChannel(jobsChannel);
      clearInterval(statusInterval);
    };
  }, [isAuthenticated, fetchGuests, checkWorkerStatus, fetchLogs]);

  const handleSendReminder = async (guest: Guest) => {
    const message = `היי 👋 נשמח מאוד לראותכם בחגיגת יום ההולדת ה-80 של עמיר! 🎉 אפשר לראות את ההזמנה ולאשר הגעה בקישור האישי כאן:\nhttps://rsvp-app-sage.vercel.app?id=${guest.unique_code}`;
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${guest.phone.replace('+', '')}?text=${encodedMessage}`;
    
    const now = new Date().toISOString();
    await supabase.from('guests').update({ last_reminder_at: now }).eq('id', guest.id);
    setGuests(prev => prev.map(g => g.id === guest.id ? { ...g, last_reminder_at: now } : g));
    window.open(whatsappUrl, '_blank');
  };

  const handleTriggerRemoteBulkSend = async (targetStatus: 'pending' | 'attending' | 'declined') => {
    const count = guests.filter(g => g.status === targetStatus).length;
    const labelMap = { pending: 'טרם ענו', attending: 'מגיעים', declined: 'לא מגיעים' };

    if (!workerOnline) {
      alert('המחשב בבית אינו מחובר! ודא שהסקריפט remote_worker.mjs רץ שם.');
      return;
    }
    if (!confirm(`האם אתה בטוח שברצונך לשלוח ל-${count} אורחים (${labelMap[targetStatus]})?`)) return;

    setIsTriggering(true);
    setJobStatus('שולח פקודה למחשב בבית...');
    setShowLogs(true);

    const { error } = await supabase
      .from('jobs')
      .insert([{ type: 'bulk_send', status: 'pending', payload: { targetStatus } }]);

    if (error) {
      alert('שגיאה בשליחת הפקודה: ' + error.message);
      setIsTriggering(false);
      setJobStatus(null);
    }
  };

  const totalAttendingGuests = guests.filter(g => g.status === 'attending').reduce((sum, g) => sum + (g.guests_count || 1), 0);
  const totalAttendingInvites = guests.filter(g => g.status === 'attending').length;
  const totalDeclined = guests.filter(g => g.status === 'declined').length;
  const totalPending = guests.filter(g => g.status === 'pending').length;
  const filteredGuests = filter === 'all' ? guests : guests.filter(g => g.status === filter);

  const getLogColor = (level: string) => {
    if (level === 'success') return 'text-green-400';
    if (level === 'error') return 'text-red-400';
    return 'text-slate-300';
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center" dir="rtl">
        <div className="bg-slate-800 p-8 rounded-3xl shadow-2xl w-full max-w-sm border border-slate-700">
          <div className="flex justify-center mb-6">
            <div className="bg-purple-500/20 p-4 rounded-2xl">
              <Lock className="w-8 h-8 text-purple-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white text-center mb-2">אזור מנהל</h1>
          <p className="text-slate-400 text-center text-sm mb-6">הכנס סיסמה כדי לגשת לפאנל הניהול</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="סיסמה"
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-right"
            />
            <button
              type="submit"
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition active:scale-95"
            >
              כניסה
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Stats */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            <h1 className="text-3xl font-bold text-slate-800">פאנל ניהול מוזמנים</h1>
            <div className="flex items-center gap-3">
              {/* Worker Status Indicator */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold ${
                workerOnline === true ? 'bg-green-50 border-green-200 text-green-700' :
                workerOnline === false ? 'bg-red-50 border-red-200 text-red-700' :
                'bg-slate-100 border-slate-200 text-slate-500'
              }`}>
                {workerOnline === true ? <Wifi className="w-4 h-4" /> :
                 workerOnline === false ? <WifiOff className="w-4 h-4" /> :
                 <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />}
                {workerOnline === true ? 'מחשב בבית מחובר' :
                 workerOnline === false ? 'מחשב בבית לא זמין' : 'בודק חיבור...'}
              </div>

              <button onClick={() => setShowLogs(!showLogs)} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition ${showLogs ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                <Terminal className="w-4 h-4" /> לוגים חיים
              </button>

              <button onClick={fetchGuests} className="text-purple-600 font-semibold hover:bg-purple-50 px-4 py-2 rounded-lg flex items-center gap-2 transition border border-purple-100">
                <Search className="w-4 h-4" /> רענן נתונים
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100">
              <p className="text-purple-600 text-sm font-bold mb-1">סה&quot;כ מגיעים (אורחים)</p>
              <p className="text-3xl font-black text-purple-900">{totalAttendingGuests}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-2xl border border-green-100">
              <p className="text-green-600 text-sm font-bold mb-1">אישרו הגעה (הזמנות)</p>
              <p className="text-3xl font-black text-green-900">{totalAttendingInvites}</p>
            </div>
            <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
              <p className="text-red-600 text-sm font-bold mb-1">סירבו הגעה</p>
              <p className="text-3xl font-black text-red-900">{totalDeclined}</p>
            </div>
            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
              <p className="text-amber-600 text-sm font-bold mb-1">טרם ענו</p>
              <p className="text-3xl font-black text-amber-900">{totalPending}</p>
            </div>
          </div>
        </div>

        {/* Live Logs Terminal */}
        {showLogs && (
          <div className="bg-slate-900 rounded-3xl border border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <span className="text-slate-400 text-sm font-mono">יומן פעילות מחשב בבית</span>
              <button onClick={() => setLogs([])} className="text-slate-500 hover:text-slate-300 text-xs">נקה</button>
            </div>
            <div className="p-4 h-56 overflow-y-auto font-mono text-sm space-y-1">
              {logs.length === 0 ? (
                <p className="text-slate-500 text-xs">אין לוגים עדיין. לחץ על &quot;הפעל שליחה&quot; כדי לראות פעילות...</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 text-xs">
                    <span className="text-slate-500 shrink-0">
                      {new Date(log.created_at).toLocaleTimeString('he-IL')}
                    </span>
                    <span className={getLogColor(log.level)}>{log.message}</span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* Filters & Bulk Actions */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-xl font-medium text-sm transition ${filter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>הכל</button>
              <button onClick={() => setFilter('attending')} className={`px-4 py-2 rounded-xl font-medium text-sm transition ${filter === 'attending' ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>מגיעים</button>
              <button onClick={() => setFilter('declined')} className={`px-4 py-2 rounded-xl font-medium text-sm transition ${filter === 'declined' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>לא מגיעים</button>
              <button onClick={() => setFilter('pending')} className={`px-4 py-2 rounded-xl font-medium text-sm transition ${filter === 'pending' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>ממתינים לתשובה</button>
            </div>

            {filter !== 'all' && filteredGuests.length > 0 && (() => {
              const colorMap = {
                pending:   { bg: 'bg-blue-50',   border: 'border-blue-100',   icon: 'text-blue-600',   btn: 'bg-blue-600 hover:bg-blue-700',   text: 'text-blue-800',   sub: 'text-blue-600' },
                attending: { bg: 'bg-green-50',  border: 'border-green-100',  icon: 'text-green-600',  btn: 'bg-green-600 hover:bg-green-700',  text: 'text-green-800',  sub: 'text-green-600' },
                declined:  { bg: 'bg-red-50',    border: 'border-red-100',    icon: 'text-red-500',    btn: 'bg-red-500 hover:bg-red-600',      text: 'text-red-800',    sub: 'text-red-600' },
              };
              const labelMap = {
                pending:   { title: `שלח הודעה לכל ה-${totalPending} שטרם ענו`, sub: 'תזכורת – בקש לאשר או לסרב', btnText: 'שלח תזכורת לכולם 🚀' },
                attending: { title: `שלח הודעה לכל ה-${totalAttendingInvites} מגיעים`, sub: 'לדוגמא: פרטי אירוע, הוראות הגעה ופרקינג', btnText: 'שלח לכל המגיעים 🎉' },
                declined:  { title: `שלח הודעה לכל ה-${totalDeclined} שלא מגיעים`, sub: 'לדוגמא: הזמנה לאירוע הבא', btnText: 'שלח לכל שלא מגיעים' },
              };
              const c = colorMap[filter as keyof typeof colorMap];
              const l = labelMap[filter as keyof typeof labelMap];
              return (
                <div className={`${c.bg} border ${c.border} p-4 rounded-2xl flex flex-col md:flex-row items-center gap-4 transition-all`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${isTriggering ? 'bg-amber-100 animate-spin' : c.bg}`}>
                      <Send className={`w-5 h-5 ${isTriggering ? 'text-amber-600' : c.icon}`} />
                    </div>
                    <div>
                      <p className={`text-sm font-bold ${c.text}`}>{l.title}</p>
                      <p className={`text-xs ${c.sub}`}>{l.sub}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleTriggerRemoteBulkSend(filter as 'pending' | 'attending' | 'declined')}
                    disabled={isTriggering}
                    className={`mr-auto px-6 py-2 rounded-xl font-bold transition shadow-sm active:scale-95 flex items-center gap-2 ${
                      isTriggering
                        ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                        : workerOnline ? `${c.btn} text-white` : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {isTriggering ? (jobStatus || 'מעבד...') : workerOnline ? l.btnText : 'המחשב לא מחובר'}
                  </button>
                </div>
              );
            })()}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
                <tr>
                  <th className="p-4">שם אורח</th>
                  <th className="p-4">טלפון</th>
                  <th className="p-4 text-center">כמות</th>
                  <th className="p-4">תאריך שליחה</th>
                  <th className="p-4">תשובה אחרונה</th>
                  <th className="p-4">סטטוס</th>
                  <th className="p-4">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-400">טוען נתונים...</td></tr>
                ) : filteredGuests.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-400">אין אורחים שתואמים לסינון.</td></tr>
                ) : (
                  filteredGuests.map(guest => (
                    <tr key={guest.id} className="hover:bg-slate-50/50 transition">
                      <td className="p-4 font-bold text-slate-800">{guest.name}</td>
                      <td className="p-4 text-slate-600 font-mono text-right" style={{direction: 'ltr'}}>{guest.phone}</td>
                      <td className="p-4 text-center font-bold text-slate-800">{guest.status === 'attending' ? guest.guests_count : '-'}</td>
                      
                      <td className="p-4 text-slate-500 text-xs">
                        {guest.last_reminder_at ? new Date(guest.last_reminder_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                      </td>

                      <td className="p-4 text-slate-500 text-xs">
                        {guest.status !== 'pending'
                          ? new Date(guest.updated_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
                          : '-'}
                      </td>

                      <td className="p-4">
                        {guest.status === 'attending' && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-700 font-bold text-xs"><CheckCircle2 className="w-3 h-3"/> אישר</span>}
                        {guest.status === 'declined' && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 font-bold text-xs"><XCircle className="w-3 h-3"/> סירב</span>}
                        {guest.status === 'pending' && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 font-bold text-xs"><HelpCircle className="w-3 h-3"/> טרם ענה</span>}
                      </td>

                      <td className="p-4">
                        <button 
                          onClick={() => handleSendReminder(guest)}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-xs transition shadow-sm active:scale-95"
                        >
                          <MessageSquareShare className="w-4 h-4" />
                          שלח
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
