"use client";
import dynamic from 'next/dynamic';

const AdminContent = dynamic(() => import('./AdminContent'), { 
  ssr: false,
  loading: () => <div className="min-h-screen bg-slate-900" />
});

export default function AdminPage() {
  return <AdminContent />;
}
