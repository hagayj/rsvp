/* eslint-disable */
"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Lock, CheckCircle2, XCircle, HelpCircle, Search, MessageSquareShare, Send, Terminal, Wifi, WifiOff, RefreshCw, Ban, MessageSquare, Phone, Globe, Clock } from 'lucide-react';

interface Guest {
  id: string;
  name: string;
  phone: string;
  status: 'pending' | 'attending' | 'declined' | 'deleted';
  guests_count: number;
  unique_code: string;
  updated_at: string;
  last_reminder_at: string | null;
  added_by: string;
  greeting_name?: string;
}

interface LogEntry {
  id: string;
  message: string;
  level: string;
  created_at: string;
}

export default function AdminContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [guests, setGuests] = useState<Guest[]>([]);
  const [filter, setFilter] = useState<'all' | 'attending' | 'declined' | 'pending' | 'not_invited'>('all');
  const [loading, setLoading] = useState(false);
  const [activeJobType, setActiveJobType] = useState<string | null>(null);
  const isTriggering = activeJobType !== null;
  const [activeJobStatus, setActiveJobStatus] = useState<string | null>(null);
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [isPollingLogs, setIsPollingLogs] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [nameSearch, setNameSearch] = useState('');
  const [addedBySearch, setAddedBySearch] = useState('');
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const logsEndRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

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

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'amir2026') {
      setIsAuthenticated(true);
    } else {
      alert('סיסמה שגויה!');
    }
  };

  useEffect(() => {
    if (showLogs && isAutoScrollEnabled) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogs, isAutoScrollEnabled]);

  // Handle manual scroll to disable auto-scroll
  const handleTerminalScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    if (!isAtBottom && isAutoScrollEnabled) {
      // User scrolled up, but let's keep it enabled unless they really mean it? 
      // Actually, common UX is to disable it if they scroll up.
    }
  };

  useEffect(() => {
    if (!isPollingLogs || !isAuthenticated) return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [isPollingLogs, isAuthenticated, fetchLogs]);

  useEffect(() => {
    if (!isAuthenticated) return;
    
    fetchGuests();
    checkWorkerStatus();
    fetchLogs();

    const statusInterval = setInterval(checkWorkerStatus, 30000);

    const logsChannel = supabase
      .channel('system-logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'system_logs' },
        (payload) => {
          const log = payload.new as LogEntry;
          setLogs(prev => {
            if (prev.find(l => l.id === log.id)) return prev;
            setShowLogs(true);
            return [log, ...prev].slice(0, 100);
          });

          // Fallback: detect completion from logs
          if (log.message.includes('סנכרון טלגרם הסתיים בהצלחה') || log.message.includes('סנכרון הושלם')) {
            setActiveJobType(null);
            setActiveJobStatus(null);
            fetchGuests();
          }
        }
      )
      .subscribe();

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

    const jobsChannel = supabase
      .channel('job-status')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs' },
        (payload) => {
          const job = payload.new as { status: string, type: string };
          if (job.status === 'completed') {
            setActiveJobType(null);
            setActiveJobStatus(null);
            fetchGuests();
          } else if (job.status === 'processing') {
            const msgs: Record<string, string> = {
               'telegram_sync': 'מסנכרן מול טלגרם...',
               'bulk_send': 'המחשב בבית שולח הודעות...',
               'delete_guest': 'שרת: מבצע מחיקה לצמיתות...'
            };
            setActiveJobStatus(msgs[job.type] || 'מעבד...');
            setShowLogs(true);
            setIsPollingLogs(true);
          } else if (job.status === 'failed') {
            setActiveJobType(null);
            setActiveJobStatus('שגיאה בתהליך! בדוק את הטרמינל למטה');
            fetchGuests();
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

  const buildInviteMessage = (guest: Guest) => {
    const greeting = guest.greeting_name ? `היי ${guest.greeting_name}` : 'היי';
    return `${greeting}, נשמח מאוד לראותכם בחגיגת יום ההולדת ה-80 של עמיר! אפשר לראות את ההזמנה ולאשר הגעה בקישור האישי כאן:\nhttps://rsvp-app-sage.vercel.app?id=${guest.unique_code}\n\n*(אם הקישור לא נפתח, יש לשמור אותי כאיש קשר והוא ייפתח)*`;
  };

  const handleSendReminder = async (guest: Guest) => {
    const message = buildInviteMessage(guest);
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${guest.phone.replace('+', '')}?text=${encodedMessage}`;
    
    const now = new Date().toISOString();
    await supabase.from('guests').update({ last_reminder_at: now }).eq('id', guest.id);
    setGuests(prev => prev.map(g => g.id === guest.id ? { ...g, last_reminder_at: now } : g));
    window.open(whatsappUrl, '_blank');
  };

  const handleSendSms = async (guest: Guest) => {
    const message = buildInviteMessage(guest);
    // Format phone for SMS: need local format or international without +
    // sms: URI — body param works on iOS & Android
    const phone = guest.phone.startsWith('+') ? guest.phone : `+${guest.phone}`;
    const smsUrl = `sms:${phone}?&body=${encodeURIComponent(message)}`;

    const now = new Date().toISOString();
    await supabase.from('guests').update({ last_reminder_at: now }).eq('id', guest.id);
    setGuests(prev => prev.map(g => g.id === guest.id ? { ...g, last_reminder_at: now } : g));
    window.location.href = smsUrl;
  };

  const handleSendSecondReminder = async (guest: Guest) => {
    const reminderMessage = `*עמיר זיבליק חוגג גבורות!*
נתראה ביום ו' הקרוב 5.6.2026, במוזיאון הטרקטור שבעין ורד
התכנסות החל מהשעה 20:00
תחילת שירה בשעה 21:00

מבקשים שלא להביא מתנות, ובמקום לתרום באהבה גדולה למוזיאון ❤️`;

    const phone = guest.phone.startsWith('+') ? guest.phone : `+${guest.phone}`;
    const smsUrl = `sms:${phone}?&body=${encodeURIComponent(reminderMessage)}`;
    window.location.href = smsUrl;
  };

  const handleTriggerRemoteBulkSend = async (targetStatus: 'pending' | 'attending' | 'declined' | 'not_invited') => {
    const count = targetStatus === 'not_invited' 
      ? guests.filter(g => g.status === 'pending' && !g.last_reminder_at).length
      : targetStatus === 'pending'
      ? guests.filter(g => g.status === 'pending' && g.last_reminder_at).length
      : guests.filter(g => g.status === targetStatus).length;

    const labelMap = { 
      pending: 'ממתינים לתשובה (נשלח)', 
      not_invited: 'טרם הוזמנו',
      attending: 'מגיעים', 
      declined: 'לא מגיעים' 
    };

    if (!workerOnline) {
      alert('המחשב בבית אינו מחובר! ודא שהסקריפט remote_worker.mjs רץ שם.');
      return;
    }
    if (!confirm(`האם אתה בטוח שברצונך לשלוח ל-${count} אורחים (${labelMap[targetStatus]})?`)) return;

    setActiveJobType('bulk_send');
    setActiveJobStatus('שולח פקודה למחשב בבית...');
    setShowLogs(true);
    setIsPollingLogs(true);

    const { error } = await supabase
      .from('jobs')
      .insert([{ type: 'bulk_send', status: 'pending', payload: { targetStatus } }]);

    if (error) {
      alert('שגיאה בשליחת הפקודה: ' + error.message);
      setActiveJobType(null);
      setActiveJobStatus(null);
    }
  };

  const handleTriggerTelegramSync = async () => {
    if (!workerOnline) {
      alert('המחשב בבית אינו מחובר! ודא שהסקריפט remote_worker.mjs רץ שם.');
      return;
    }
    
    setActiveJobType('telegram_sync');
    setActiveJobStatus('שולח פקודת סנכרון למחשב בבית...');
    setShowLogs(true);
    setIsPollingLogs(true);

    const { error } = await supabase
      .from('jobs')
      .insert([{ type: 'telegram_sync', status: 'pending', payload: {} }]);

    if (error) {
      alert('שגיאה בשליחת פקודת הסנכרון: ' + error.message);
      setActiveJobType(null);
      setActiveJobStatus(null);
    }
  };

  const handleDeleteGuest = async (id: string, name: string) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק לצמיתות את ${name}?`)) return;
    
    setActiveJobType('delete_guest');
    setActiveJobStatus('מבצע מחיקה בענן...');
    setShowLogs(true);
    setIsPollingLogs(true);
    
    setLogs(prev => [...prev, { 
      id: Math.random().toString(), 
      message: `[CLIENT] Requesting cloud deletion of ${name} (${id})`, 
      level: 'info', 
      created_at: new Date().toISOString() 
    }]);

    try {
      const response = await fetch('/api/delete-guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      });

      if (response.ok) {
        setLogs(prev => [...prev, { 
          id: Math.random().toString(), 
          message: `✅ [CLOUD] האורח ${name} נמחק בהצלחה!`, 
          level: 'success', 
          created_at: new Date().toISOString() 
        }]);
        setActiveJobType(null);
        setActiveJobStatus(null);
        fetchGuests();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Unknown error');
      }
    } catch (error: any) {
      alert('שגיאה במחיקה: ' + error.message);
      setActiveJobType(null);
      setActiveJobStatus(null);
    }
  };

  const handleUpdateGreetingName = async (id: string, newName: string) => {
    try {
      const { error } = await supabase
        .from('guests')
        .update({ greeting_name: newName })
        .eq('id', id);

      if (!error) {
        setGuests(prev => prev.map(g => g.id === id ? { ...g, greeting_name: newName } : g));
        setEditingId(null);
      } else {
        throw error;
      }
    } catch (err: any) {
      alert('שגיאה בעדכון השם: ' + err.message);
    }
  };

  const handleResetJobs = async () => {
    if (!confirm('האם אתה בטוח שברצונך לאפס את הסטטוס? זה ישחרר את הכפתורים התקועים.')) return;
    
    const { error } = await supabase
      .from('jobs')
      .update({ status: 'failed' })
      .in('status', ['pending', 'processing']);
    
    if (!error) {
      setActiveJobType(null);
      setActiveJobStatus(null);
      setLogs(prev => [...prev, { 
        id: Math.random().toString(), 
        message: '🛠️ בוצע איפוס ידני לסטטוס העבודות.', 
        level: 'info', 
        created_at: new Date().toISOString() 
      }]);
    } else {
      alert('שגיאה באיפוס: ' + error.message);
    }
  };


  const handleAddManualGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName || !manualPhone) return;

    let phone = manualPhone.replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) phone = '+972' + phone.slice(1);
    else if (!phone.startsWith('+')) phone = '+' + phone;

    // בדיקה האם מספר הטלפון כבר קיים במערכת
    const { data: existing } = await supabase
      .from('guests')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();

    if (existing) {
      if (existing.status === 'deleted') {
        if (confirm(`איש קשר עם מספר זה היה קיים בעבר ונמחק (${existing.name}).\nהאם ברצונך לשחזר אותו ולעדכן את שמו ל-"${manualName}"?`)) {
          const { error: updateError } = await supabase
            .from('guests')
            .update({
              name: manualName,
              status: 'pending',
              added_by: 'מנהל (ידני)',
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);

          if (!updateError) {
            setManualName('');
            setManualPhone('');
            setShowManualAdd(false);
            fetchGuests();
            return;
          } else {
            alert('שגיאה בשחזור האורח: ' + updateError.message);
            return;
          }
        } else {
          return;
        }
      } else {
        const statusMap: Record<string, string> = {
          pending: 'ממתין לתשובה / טרם הוזמן',
          attending: 'מגיע',
          declined: 'לא מגיע'
        };
        const statusHeb = statusMap[existing.status] || existing.status;
        alert(`שים לב: מספר הטלפון ${manualPhone} כבר קיים במערכת!\n\nשם רשום: ${existing.name}\nסטטוס נוכחי: ${statusHeb}`);
        return;
      }
    }

    const unique_code = Math.random().toString(36).substring(2, 10);

    const { error } = await supabase.from('guests').insert([{
      name: manualName,
      phone: phone,
      added_by: 'מנהל (ידני)',
      status: 'pending',
      unique_code
    }]);

    if (!error) {
      setManualName('');
      setManualPhone('');
      setShowManualAdd(false);
      fetchGuests();
    } else {
      alert('שגיאה בהוספת אורח: ' + error.message);
    }
  };

  const totalAttendingGuests = guests.filter(g => g.status === 'attending').reduce((sum, g) => sum + (g.guests_count || 1), 0);
  const totalAttendingInvites = guests.filter(g => g.status === 'attending').length;
  const totalDeclined = guests.filter(g => g.status === 'declined').length;
  const totalPendingResponse = guests.filter(g => g.status === 'pending' && g.last_reminder_at).length;
  const totalNotInvited = guests.filter(g => g.status === 'pending' && !g.last_reminder_at).length;
  
  const filteredGuests = guests
    .filter(g => g.status !== 'deleted')
    .filter(g => {
      if (filter === 'all') return true;
      if (filter === 'not_invited') return g.status === 'pending' && !g.last_reminder_at;
      if (filter === 'pending') return g.status === 'pending' && g.last_reminder_at;
      return g.status === filter;
    })
    .filter(g => {
      const nameMatch = (g.name || '').toLowerCase().includes(nameSearch.toLowerCase());
      const addedByMatch = (g.added_by || 'מערכת').toLowerCase().includes(addedBySearch.toLowerCase());
      return nameMatch && addedByMatch;
    })
    .sort((a, b) => {
      const ta = a.last_reminder_at ? new Date(a.last_reminder_at).getTime() : 0;
      const tb = b.last_reminder_at ? new Date(b.last_reminder_at).getTime() : 0;
      return sortDir === 'desc' ? tb - ta : ta - tb;
    });

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
        
        {/* Header Actions & Status */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            <h1 className="text-3xl font-bold text-slate-800">פאנל ניהול מוזמנים.</h1>
            <div className="flex flex-wrap items-center gap-3">
              <button 
                onClick={handleTriggerTelegramSync}
                disabled={activeJobType === 'telegram_sync' || !workerOnline}
                className={`flex items-center gap-2 px-4 py-3 rounded-2xl font-bold transition shadow-md active:scale-95 ${
                  activeJobType === 'telegram_sync' ? 'bg-slate-200 text-slate-500' : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                <div className={activeJobType === 'telegram_sync' ? 'animate-spin' : ''}>
                  <Terminal className="w-5 h-5" />
                </div>
                סנכרן מטלגרם
              </button>

              <button 
                onClick={() => setShowManualAdd(true)}
                className="flex items-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-bold transition shadow-md active:scale-95"
              >
                <CheckCircle2 className="w-5 h-5" />
                הוספה ידנית
              </button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
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
                <Terminal className="w-4 h-4" /> לוגים
              </button>

              <button onClick={fetchGuests} className="text-purple-600 font-semibold hover:bg-purple-50 px-4 py-2 rounded-lg flex items-center gap-2 transition border border-purple-100">
                <Search className="w-4 h-4" /> רענן
              </button>
            </div>
          </div>
        </div>

        {/* Manual Add Modal Overlay */}
        {showManualAdd && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm border border-slate-200 animate-in fade-in zoom-in duration-200">
              <h2 className="text-2xl font-bold text-slate-800 mb-2">הוספת אורח ידנית</h2>
              <p className="text-slate-500 text-sm mb-6">הכנס את פרטי האורח להוספה מיידית</p>
              <form onSubmit={handleAddManualGuest} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1 mr-1">שם האורח</label>
                  <input
                    required
                    type="text"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="לדוגמא: ישראל ישראלי"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1 mr-1">מספר טלפון</label>
                  <input
                    required
                    type="tel"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                    placeholder="050-0000000"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="submit" className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl active:scale-95 transition hover:bg-purple-700">הוסף אורח</button>
                  <button type="button" onClick={() => setShowManualAdd(false)} className="px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl active:scale-95 transition hover:bg-slate-200">ביטול</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Stats Grid */}
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
            <p className="text-amber-600 text-sm font-bold mb-1">ממתינים לתשובה</p>
            <p className="text-3xl font-black text-amber-900">{totalPendingResponse}</p>
          </div>
          <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
            <p className="text-blue-600 text-sm font-bold mb-1">טרם הוזמנו</p>
            <p className="text-3xl font-black text-blue-900">{totalNotInvited}</p>
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
              <div className="flex items-center gap-4">
                <div className="flex items-center bg-slate-700 rounded-lg p-0.5 border border-slate-600">
                  <button 
                    onClick={() => { setIsPollingLogs(true); fetchLogs(); }}
                    className={`p-1.5 rounded-md transition ${isPollingLogs ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}
                    title="סנכרון לוגים אוטומטי (כל 5 שניות)"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isPollingLogs ? 'animate-spin-slow' : ''}`} />
                  </button>
                  <button 
                    onClick={() => setIsPollingLogs(false)}
                    className={`p-1.5 rounded-md transition ${!isPollingLogs ? 'bg-slate-600 text-slate-200' : 'text-slate-500 hover:text-slate-400'}`}
                    title="הפסק סנכרון אוטומטי"
                  >
                    <Ban className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button 
                  onClick={handleResetJobs}
                  className="text-amber-500 hover:text-amber-400 text-xs font-bold flex items-center gap-1 border border-amber-500/30 px-2 py-0.5 rounded-lg transition"
                >
                  נקה סטטוס תקוע 🛠️
                </button>
                <button 
                  onClick={() => setIsAutoScrollEnabled(!isAutoScrollEnabled)}
                  className={`text-xs font-bold px-2 py-0.5 rounded-lg border transition ${isAutoScrollEnabled ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' : 'text-slate-500 border-slate-700'}`}
                >
                  {isAutoScrollEnabled ? 'גלילה אוטומטית ON' : 'גלילה אוטומטית OFF'}
                </button>
                <button onClick={() => setLogs([])} className="text-slate-500 hover:text-slate-300 text-xs">נקה</button>
              </div>
            </div>
            <div 
              onScroll={handleTerminalScroll}
              className="p-4 h-56 overflow-y-auto font-mono text-sm space-y-1"
            >
              {logs.length === 0 ? (
                <p className="text-slate-500 text-xs">אין לוגים עדיין...</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 text-xs">
                    <span className="text-slate-500 shrink-0">{new Date(log.created_at).toLocaleTimeString('he-IL')}</span>
                    <span className={getLogColor(log.level)}>{log.message}</span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* Guest List & Filters */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-xl font-medium text-sm transition ${filter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>הכל</button>
              <button onClick={() => setFilter('attending')} className={`px-4 py-2 rounded-xl font-medium text-sm transition ${filter === 'attending' ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>מגיעים</button>
              <button onClick={() => setFilter('declined')} className={`px-4 py-2 rounded-xl font-medium text-sm transition ${filter === 'declined' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>לא מגיעים</button>
              <button onClick={() => setFilter('pending')} className={`px-4 py-2 rounded-xl font-medium text-sm transition ${filter === 'pending' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>ממתינים לתשובה</button>
              <button onClick={() => setFilter('not_invited')} className={`px-4 py-2 rounded-xl font-medium text-sm transition ${filter === 'not_invited' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>טרם הוזמנו</button>
            </div>

            {filter !== 'all' && filteredGuests.length > 0 && (() => {
              const colorMap = {
                pending:   { bg: 'bg-blue-50',   border: 'border-blue-100',   icon: 'text-blue-600',   btn: 'bg-blue-600 hover:bg-blue-700',   text: 'text-blue-800',   sub: 'text-blue-600' },
                attending: { bg: 'bg-green-50',  border: 'border-green-100',  icon: 'text-green-600',  btn: 'bg-green-600 hover:bg-green-700',  text: 'text-green-800',  sub: 'text-green-600' },
                declined:  { bg: 'bg-red-50',    border: 'border-red-100',    icon: 'text-red-500',    btn: 'bg-red-500 hover:bg-red-600',      text: 'text-red-800',    sub: 'text-red-600' },
              };
              const labelMap = {
                pending:   { title: `שלח תזכורת לכל ה-${totalPendingResponse} שטרם ענו`, sub: 'תזכורת נוספת למי שכבר קיבל', btnText: 'שלח תזכורת 🚀' },
                not_invited: { title: `שלח הזמנה לכל ה-${totalNotInvited} שטרם הוזמנו`, sub: 'שליחת הודעה ראשונה למוזמנים חדשים', btnText: 'שלח הזמנות לכולם 📧' },
                attending: { title: `שלח הודעה לכל ה-${totalAttendingInvites} מגיעים`, sub: 'מידע על האירוע', btnText: 'שלח לכל המגיעים 🎉' },
                declined:  { title: `שלח הודעה לכל ה-${totalDeclined} שלא מגיעים`, sub: 'הודעת תודה בכל זאת', btnText: 'שלח לכל שלא מגיעים' },
              };
              const c = colorMap[filter === 'not_invited' ? 'pending' : filter as keyof typeof colorMap];
              const l = labelMap[filter as keyof typeof labelMap];
              return (
                <div className={`${c.bg} border ${c.border} p-4 rounded-2xl flex flex-col md:flex-row items-center gap-4 transition-all`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${activeJobType === 'bulk_send' ? 'bg-amber-100 animate-spin' : c.bg}`}>
                      <Send className={`w-5 h-5 ${activeJobType === 'bulk_send' ? 'text-amber-600' : c.icon}`} />
                    </div>
                    <div>
                      <p className={`text-sm font-bold ${c.text}`}>{l.title}</p>
                      <p className={`text-xs ${c.sub}`}>{l.sub}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleTriggerRemoteBulkSend(filter as 'pending' | 'attending' | 'declined' | 'not_invited')}
                    disabled={activeJobType === 'bulk_send'}
                    className={`mr-auto px-6 py-2 rounded-xl font-bold transition shadow-sm active:scale-95 flex items-center gap-2 ${
                      activeJobType === 'bulk_send'
                        ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                        : workerOnline ? `${c.btn} text-white` : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {activeJobType === 'bulk_send' ? (activeJobStatus || 'שולח...') : workerOnline ? l.btnText : 'המחשב לא מחובר'}
                  </button>
                </div>
              );
            })()}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
                <tr>
                  <th className="p-4">
                    <div className="flex flex-col gap-2">
                      <span>שם אורח</span>
                      <input 
                        type="text" 
                        value={nameSearch}
                        onChange={(e) => setNameSearch(e.target.value)}
                        placeholder="חפש שם..."
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-normal outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                  </th>
                  <th className="p-4">שם לפנייה (היי ___)</th>
                  <th className="p-4">טלפון</th>
                  <th className="p-4">
                    <div className="flex flex-col gap-2">
                       <span>הוסיף</span>
                       <input 
                        type="text" 
                        value={addedBySearch}
                        onChange={(e) => setAddedBySearch(e.target.value)}
                        placeholder="חפש..."
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-normal outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                  </th>
                  <th className="p-4 text-center">כמות</th>
                  <th className="p-4">סטטוס</th>
                  <th className="p-4">
                    <button
                      onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                      className="flex items-center gap-1 font-bold hover:text-purple-600 transition select-none"
                      title="מיין לפי זמן שליחה"
                    >
                      נשלח בשעה
                      <span className="text-base leading-none">{sortDir === 'desc' ? '↓' : '↑'}</span>
                    </button>
                  </th>
                  <th className="p-4">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr><td colSpan={8} className="p-8 text-center text-slate-400">טוען נתונים...</td></tr>
                ) : filteredGuests.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-slate-400">אין אורחים שתואמים לסינון.</td></tr>
                ) : (
                  filteredGuests.map(guest => (
                    <tr key={guest.id} className="hover:bg-slate-50/50 transition">
                      <td className="p-4">
                        <div className="font-bold text-slate-800">{guest.name}</div>
                      </td>
                      <td className="p-4">
                        {editingId === guest.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              autoFocus
                              type="text"
                              className="w-full px-2 py-1 border border-purple-500 rounded-lg outline-none focus:ring-2 focus:ring-purple-200"
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onBlur={() => handleUpdateGreetingName(guest.id, editingValue)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleUpdateGreetingName(guest.id, editingValue);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                            />
                          </div>
                        ) : (
                          <div 
                            onClick={() => {
                              setEditingId(guest.id);
                              setEditingValue(guest.greeting_name || '');
                            }}
                            className="text-purple-600 hover:bg-purple-50 px-2 py-1 rounded cursor-pointer transition italic font-medium"
                          >
                            {guest.greeting_name || 'לחץ לעדכון...'}
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-slate-600 font-mono text-right" style={{direction: 'ltr'}}>{guest.phone}</td>
                      <td className="p-4 text-slate-500 text-sm">{guest.added_by || 'מערכת'}</td>
                      <td className="p-4 text-center font-bold text-slate-800">{guest.status === 'attending' ? guest.guests_count : '-'}</td>
                      <td className="p-4">
                        {guest.status === 'attending' && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-700 font-bold text-xs"><CheckCircle2 className="w-3 h-3"/> אישר</span>}
                        {guest.status === 'declined' && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 font-bold text-xs"><XCircle className="w-3 h-3"/> סירב</span>}
                        {guest.status === 'pending' && (
                          guest.last_reminder_at 
                            ? <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 font-bold text-xs"><HelpCircle className="w-3 h-3"/> ממתין לתשובה</span>
                            : <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-700 font-bold text-xs"><Send className="w-3 h-3"/> טרם הוזמן</span>
                        )}
                      </td>
                      <td className="p-4 text-slate-500 text-xs font-mono">
                        {guest.last_reminder_at ? new Date(guest.last_reminder_at).toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '-'}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSendReminder(guest)}
                            title="שלח בוואטסאפ"
                            className="p-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition shadow-sm"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                          {guest.status === 'attending' && (
                            <button
                              onClick={() => handleSendSecondReminder(guest)}
                              title="שלח תזכורת SMS"
                              className="p-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition shadow-sm"
                            >
                              <Clock className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleSendSms(guest)}
                            title="שלח SMS"
                            className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition shadow-sm"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                          <a
                            href={`tel:${guest.phone.startsWith('+') ? guest.phone : '+' + guest.phone}`}
                            title="התקשר"
                            className="p-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition shadow-sm flex items-center"
                          >
                            <Phone className="w-4 h-4" />
                          </a>
                          <a
                            href={`/?id=${guest.unique_code}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="ערוך אישור הגעה"
                            className="p-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition shadow-sm flex items-center"
                          >
                            <Globe className="w-4 h-4" />
                          </a>
                          <button onClick={() => handleDeleteGuest(guest.id, guest.name)} className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition shadow-sm"><XCircle className="w-4 h-4" /></button>
                        </div>
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
