import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  Target, 
  AlertTriangle, 
  UserPlus, 
  Play, 
  RefreshCw, 
  Upload, 
  Eye, 
  Volume2, 
  VolumeX, 
  List, 
  Trash2,
  Activity,
  Layers,
  Map,
  X
} from 'lucide-react';

const API_BASE = 'https://al-and-ml-enabled-video-analysis-and-7m20.onrender.com';

function App() {
  const [activeFeed, setActiveFeed] = useState('webcam');
  const [watchlist, setWatchlist] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState({
    active_sources: 0,
    watchlist_count: 0,
    total_alerts: 0,
    trained: false
  });
  
  // Watchlist form states
  const [enrollName, setEnrollName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [enrollStatus, setEnrollStatus] = useState('');
  
  // Sound alarm & overlay states
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hudScanline, setHudScanline] = useState(true);
  
  // Simulation modal states
  const [showSimPanel, setShowSimPanel] = useState(false);
  const [simSource, setSimSource] = useState('drone-01');
  const [simType, setSimType] = useState('WEAPON_DETECTED');
  const [simMsg, setSimMsg] = useState('Assault weapon detected in target hand.');
  const [simConf, setSimConf] = useState(94.2);
  
  // Detail views
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [latestAlert, setLatestAlert] = useState(null);
  
  const fileInputRef = useRef(null);
  
  // Poll data
  useEffect(() => {
    fetchWatchlist();
    fetchAlerts();
    fetchStats();
    
    const interval = setInterval(() => {
      fetchAlerts();
      fetchStats();
    }, 2000);
    
    return () => clearInterval(interval);
  }, []);

  // Monitor for incoming critical alerts to trigger sound/HUD notifications
  useEffect(() => {
    if (alerts.length > 0) {
      const topAlert = alerts[0];
      // If it's a new alert (within the last 4 seconds)
      const alertTime = new Date(topAlert.timestamp).getTime();
      const now = new Date().getTime();
      
      if (now - alertTime < 4000) {
        if (!latestAlert || latestAlert.id !== topAlert.id) {
          setLatestAlert(topAlert);
          triggerBuzzer(topAlert.type);
        }
      }
    }
  }, [alerts]);

  const triggerBuzzer = (type) => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      if (type === 'WEAPON_DETECTED') {
        // Double high-pitch alarm beep
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(950, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.25);
        
        setTimeout(() => {
          const osc2 = audioCtx.createOscillator();
          const gain2 = audioCtx.createGain();
          osc2.connect(gain2);
          gain2.connect(audioCtx.destination);
          osc2.type = 'sawtooth';
          osc2.frequency.setValueAtTime(1100, audioCtx.currentTime);
          gain2.gain.setValueAtTime(0.2, audioCtx.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
          osc2.start();
          osc2.stop(audioCtx.currentTime + 0.25);
        }, 180);
      } else if (type === 'WATCHLIST_MATCH') {
        // Alternating radar chirp
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(900, audioCtx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
      } else {
        // Soft standard chirp
        osc.type = 'sine';
        osc.frequency.setValueAtTime(500, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
      }
    } catch (e) {
      console.warn("Audio Context blocked or failed:", e);
    }
  };

  const fetchWatchlist = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/watchlist`);
      if (res.ok) {
        const data = await res.ok ? await res.json() : [];
        setWatchlist(data);
      }
    } catch (e) {
      console.error("Error fetching watchlist", e);
    }
  };

  const fetchAlerts = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/alerts`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data);
      }
    } catch (e) {
      console.error("Error fetching alerts", e);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error("Error fetching stats", e);
    }
  };

  const handleEnrollSubmit = async (e) => {
    e.preventDefault();
    if (!enrollName || !selectedFile) {
      setEnrollStatus('Error: Provide name and facial capture image.');
      return;
    }
    
    const formData = new FormData();
    formData.append('name', enrollName);
    formData.append('file', selectedFile);
    
    setEnrollStatus('Uploading & Training...');
    try {
      const res = await fetch(`${API_BASE}/api/watchlist/enroll`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        setEnrollName('');
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setEnrollStatus('Enrollment complete. Model trained.');
        fetchWatchlist();
        fetchStats();
      } else {
        const errorData = await res.json();
        setEnrollStatus(`Failed: ${errorData.detail || 'Server error'}`);
      }
    } catch (e) {
      setEnrollStatus('Network connection failure.');
    }
  };

  const handleDeleteMember = async (id) => {
    if (!confirm('Are you sure you want to remove this profile from the security watchlist?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/watchlist/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchWatchlist();
        fetchStats();
      }
    } catch (e) {
      alert('Failed to delete member.');
    }
  };

  const triggerSimulation = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('source', simSource);
    formData.append('type', simType);
    formData.append('message', simMsg);
    formData.append('confidence', simConf);
    
    try {
      const res = await fetch(`${API_BASE}/api/simulate_alert`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        setShowSimPanel(false);
        fetchAlerts();
        fetchStats();
      }
    } catch (e) {
      alert('Simulation call failed.');
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-neutral-50 text-slate-900 selection:bg-red-600 selection:text-white">
      
      {/* 1. FLASHING HIGH THREAT NOTIFICATION BAR */}
      {latestAlert && (latestAlert.type === 'WEAPON_DETECTED' || latestAlert.type === 'WATCHLIST_MATCH') && (
        <div className="bg-red-600 text-white font-semibold title-text py-2 px-4 flex items-center justify-between text-xs sm:text-sm glow-red anim-pulse-red border-b border-red-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>CRITICAL DEFENSE EXCEPTION LOGGED ON SOURCE: <span className="underline font-bold">{latestAlert.source.toUpperCase()}</span> - {latestAlert.message.toUpperCase()}</span>
          </div>
          <button 
            className="text-white hover:text-red-200 transition-colors ml-4 p-0.5 rounded border border-white/20 hover:border-white/50"
            onClick={() => setLatestAlert(null)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. HEADER */}
      <header className="bg-white border-b border-neutral-200 py-3 px-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-red-600 text-white p-2 rounded-sm border border-red-700 glow-red">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight title-text text-red-600">
              NATIONAL SECURITY GUARD
            </h1>
            <p className="text-[10px] uppercase font-mono tracking-widest text-slate-500 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-600 inline-block anim-pulse-red"></span>
              AI/ML TACTICAL INTELLIGENCE COMMAND POST (ICP)
            </p>
          </div>
        </div>

        {/* Real-time details */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
          <div className="bg-neutral-100 px-3 py-1.5 border border-neutral-200 rounded flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-red-600 animate-pulse" />
            <span className="text-slate-500">DEVICES:</span>
            <span className="font-bold text-red-600">4 ACTIVE</span>
          </div>
          <div className="bg-neutral-100 px-3 py-1.5 border border-neutral-200 rounded flex items-center gap-2">
            <Target className="w-3.5 h-3.5 text-red-600" />
            <span className="text-slate-500">WATCHLIST:</span>
            <span className="font-bold text-slate-800">{stats.watchlist_count} REGISTERED</span>
          </div>
          <button 
            onClick={() => setShowSimPanel(true)}
            className="btn-red px-3 py-1.5 text-xs flex items-center gap-1.5"
          >
            <Play className="w-3 h-3" /> SIMULATE THREAT
          </button>
        </div>
      </header>

      {/* 3. MAIN DASHBOARD CONTENT */}
      <main className="flex-1 grid grid-cols-1 xl:grid-cols-3 gap-6 p-6">
        
        {/* LEFT & CENTER PANELS - VIDEO VIEWPORT */}
        <div className="xl:col-span-2 flex flex-col gap-6">
          <div className="tactical-card p-4 flex-1 flex flex-col">
            
            {/* Feed selector tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-3 mb-4">
              <div className="flex flex-wrap gap-1 bg-neutral-100 p-1 rounded border border-neutral-200">
                {[
                  { id: 'webcam', label: 'WEBCAM / DEV FEED' },
                  { id: 'drone-01', label: 'DRONE RECON' },
                  { id: 'bodycam-03', label: 'COMMANDO BODYCAM' },
                  { id: 'robot-scout', label: 'GROUND BOT' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveFeed(tab.id)}
                    className={`px-3 py-1.5 text-xs font-mono font-semibold transition-all rounded ${
                      activeFeed === tab.id 
                        ? 'bg-red-600 text-white shadow-sm glow-red' 
                        : 'text-slate-600 hover:text-slate-900 hover:bg-neutral-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              
              {/* Feeds controls */}
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setSoundEnabled(!soundEnabled)} 
                  className={`p-2 rounded border transition-colors ${
                    soundEnabled 
                      ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' 
                      : 'bg-neutral-100 text-slate-400 border-neutral-200 hover:bg-neutral-200'
                  }`}
                  title={soundEnabled ? "Mute alert audio" : "Unmute alert audio"}
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => setHudScanline(!hudScanline)}
                  className={`px-3 py-2 text-xs font-mono border rounded transition-colors ${
                    hudScanline 
                      ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' 
                      : 'bg-neutral-100 text-slate-400 border-neutral-200 hover:bg-neutral-200'
                  }`}
                >
                  HUD SCANLINE
                </button>
              </div>
            </div>

            {/* Video Viewport Container */}
            <div className="relative flex-1 bg-black rounded border border-neutral-200 overflow-hidden flex items-center justify-center min-h-[400px] shadow-inner">
              
              {/* Video elements */}
              <img 
                src={`${API_BASE}/api/video_feed?source=${activeFeed}`}
                alt={`Surveillance Stream - ${activeFeed}`}
                className={`max-w-full max-h-[520px] object-contain ${
                  hudScanline ? 'anim-scanline' : ''
                }`}
                onError={(e) => {
                  e.target.src = "https://placehold.co/640x480/090D16/ef4444?text=FEED+OFFLINE+--+CHECK+BACKEND+API";
                }}
              />
              
              {/* Tactical overlay HUD (Visual overlay in red and white) */}
              <div className="absolute top-4 left-4 font-mono text-[10px] text-red-600 bg-black/80 px-2 py-1 border border-red-800 rounded">
                STATUS: DECRYPTED // FPS: 15.0 // AI MODEL: YOLOv8+LBPH
              </div>
              <div className="absolute bottom-4 right-4 font-mono text-[10px] text-white bg-black/80 px-2 py-1 border border-neutral-700 rounded">
                SECURE CONSOLE // NSG-ICP // 2026.07.04
              </div>
            </div>
            
            {/* Legend / Info bar */}
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs border-t border-neutral-200 pt-4">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded border border-red-600 bg-red-600/10 block"></span>
                <span className="text-slate-600">Red: Weapons/Baggage</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded border border-red-600 bg-red-600 block"></span>
                <span className="text-slate-600">Red + White: Enrolled Face</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded border border-red-600 block"></span>
                <span className="text-slate-600">Double Red: Loitering</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded border border-white block"></span>
                <span className="text-slate-600">White: Target Person</span>
              </div>
            </div>
          </div>
          
          {/* ANALYTICAL OVERVIEW & GRID HEATMAP */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="tactical-card p-4">
              <div className="flex items-center justify-between border-b border-neutral-200 pb-2 mb-3">
                <h3 className="font-semibold text-sm title-text text-red-600 flex items-center gap-2">
                  <Layers className="w-4 h-4" /> RESOURCE ALLOCATION
                </h3>
              </div>
              
              <div className="space-y-3 font-mono text-xs">
                <div>
                  <div className="flex justify-between text-slate-600 mb-1">
                    <span>Drone Target Detection Coverage</span>
                    <span className="text-slate-800 font-bold">92%</span>
                  </div>
                  <div className="h-2 w-full bg-neutral-200 rounded-full overflow-hidden">
                    <div className="bg-red-600 h-full rounded-full" style={{ width: '92%' }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-slate-600 mb-1">
                    <span>Commando Bodycams Load</span>
                    <span className="text-slate-800 font-bold">48%</span>
                  </div>
                  <div className="h-2 w-full bg-neutral-200 rounded-full overflow-hidden">
                    <div className="bg-red-600 h-full rounded-full" style={{ width: '48%' }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-slate-600 mb-1">
                    <span>Ground Bot Diagnostic State</span>
                    <span className="text-slate-800 font-bold">100%</span>
                  </div>
                  <div className="h-2 w-full bg-neutral-200 rounded-full overflow-hidden">
                    <div className="bg-red-600 h-full rounded-full" style={{ width: '100%' }}></div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="tactical-card p-4">
              <div className="flex items-center justify-between border-b border-neutral-200 pb-2 mb-3">
                <h3 className="font-semibold text-sm title-text text-red-600 flex items-center gap-2">
                  <Map className="w-4 h-4" /> SECTOR ACTIVITY GRID
                </h3>
                <span className="text-[10px] font-mono text-slate-400">SECTOR ALPHA</span>
              </div>
              
              {/* Visual custom grid representation */}
              <div className="grid grid-cols-6 gap-1">
                {Array.from({ length: 24 }).map((_, idx) => {
                  const highlight = idx === 4 || idx === 11 || idx === 18;
                  const warning = idx === 7 || idx === 15;
                  
                  return (
                    <div 
                      key={idx} 
                      className={`h-7 border border-neutral-100 rounded-sm flex items-center justify-center font-mono text-[9px] font-semibold ${
                        highlight 
                          ? 'bg-red-600 text-white font-bold glow-red' 
                          : warning 
                            ? 'bg-red-100 text-red-700 border-red-200 animate-pulse' 
                            : 'bg-neutral-100 text-slate-400'
                      }`}
                    >
                      A{idx+1}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN - WATCHLIST & ALERT HISTORIES */}
        <div className="flex flex-col gap-6">
          
          {/* A. WATCHLIST ENROLLMENT MANAGER */}
          <div className="tactical-card p-4">
            <h3 className="font-semibold text-sm title-text text-red-600 border-b border-neutral-200 pb-2 mb-3 flex items-center gap-2">
              <UserPlus className="w-4 h-4" /> WATCHLIST DATABASE
            </h3>
            
            {/* Enrollment form */}
            <form onSubmit={handleEnrollSubmit} className="space-y-3 mb-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">SUBJECT NAME</label>
                <input
                  type="text"
                  placeholder="e.g. Suspect Alpha"
                  value={enrollName}
                  onChange={(e) => setEnrollName(e.target.value)}
                  className="w-full text-xs p-2 border border-neutral-200 rounded focus:border-red-600 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">FACIAL IMAGE CAPTURE</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setSelectedFile(e.target.files[0])}
                  ref={fileInputRef}
                  className="w-full text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-mono file:font-semibold file:bg-red-50 file:text-red-700 file:cursor-pointer"
                />
              </div>

              <div className="flex justify-between items-center gap-2">
                <button type="submit" className="btn-red w-full text-center justify-center text-xs py-2">
                  <Upload className="w-3.5 h-3.5" /> ENROLL SUBJECT
                </button>
              </div>

              {enrollStatus && (
                <div className={`text-[10px] font-mono p-1 px-2 rounded ${
                  enrollStatus.includes('complete') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-neutral-100 text-slate-600'
                }`}>
                  {enrollStatus}
                </div>
              )}
            </form>

            {/* Enrolled members list */}
            <div className="border-t border-neutral-200 pt-3">
              <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Enrolled Surveillance Watchlist ({watchlist.length})</span>
              {watchlist.length === 0 ? (
                <div className="text-xs text-slate-400 font-mono text-center py-4 bg-neutral-50 rounded border border-dashed border-neutral-200">
                  NO FACE RECORDS REGISTERED IN DATABASE
                </div>
              ) : (
                <div className="max-h-[160px] overflow-y-auto space-y-2">
                  {watchlist.map((member) => (
                    <div 
                      key={member.id} 
                      className="flex items-center justify-between p-2 bg-neutral-50 border border-neutral-200 rounded"
                    >
                      <div className="flex items-center gap-2">
                        {/* Avatar from backend static */}
                        <img 
                          src={`${API_BASE}/static/watchlist/${member.photo_path.split(/[\\/]/).pop()}`}
                          alt={member.name}
                          className="w-8 h-8 rounded-sm object-cover border border-neutral-300"
                          onError={(e) => {
                            e.target.src = "https://placehold.co/100/eaeaea/ef4444?text=Face";
                          }}
                        />
                        <div className="text-xs">
                          <p className="font-bold text-slate-800">{member.name}</p>
                          <p className="text-[9px] text-slate-400 font-mono">LABEL_ID: {member.label_id}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleDeleteMember(member.id)}
                        className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                        title="Delete from Watchlist"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* B. REAL-TIME THREAT ALERTS FEED */}
          <div className="tactical-card p-4 flex-1 flex flex-col min-h-[350px]">
            <h3 className="font-semibold text-sm title-text text-red-600 border-b border-neutral-200 pb-2 mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2"><List className="w-4 h-4" /> REAL-TIME ALERT CONSOLE</span>
              <span className="text-[10px] font-mono bg-red-100 text-red-700 px-1.5 py-0.5 rounded anim-pulse-red">
                LIVE POLLING
              </span>
            </h3>

            {alerts.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-xs text-slate-400 font-mono py-12">
                <Shield className="w-8 h-8 text-neutral-300 mb-2 animate-pulse" />
                <span>NO THREAT DETECTIONS CURRENTLY LOGGED</span>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[380px] pr-1">
                {alerts.map((alert) => {
                  const isCritical = alert.type === 'WEAPON_DETECTED' || alert.type === 'WATCHLIST_MATCH';
                  
                  return (
                    <div 
                      key={alert.id}
                      onClick={() => setSelectedAlert(alert)}
                      className={`alert-card-new p-2.5 rounded border transition-all cursor-pointer hover:border-red-400 ${
                        isCritical 
                          ? 'bg-red-50/80 border-red-200 hover:bg-red-100/90' 
                          : 'bg-neutral-50 border-neutral-200 hover:bg-neutral-100'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          alert.type === 'WEAPON_DETECTED' 
                            ? 'bg-red-600 text-white' 
                            : alert.type === 'WATCHLIST_MATCH'
                              ? 'bg-red-800 text-white'
                              : 'bg-neutral-200 text-neutral-800'
                        }`}>
                          {alert.type.replace('_', ' ')}
                        </span>
                        <span className="text-[9px] font-mono text-slate-400">
                          {new Date(alert.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      
                      <p className="text-xs text-slate-800 font-medium mb-2">{alert.message}</p>
                      
                      <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 border-t border-neutral-200/50 pt-1.5">
                        <span>SRC: {alert.source.toUpperCase()}</span>
                        <span className="text-red-600 font-semibold">CONF: {alert.confidence.toFixed(1)}%</span>
                        {alert.frame_path && (
                          <span className="text-slate-500 underline flex items-center gap-0.5">
                            <Eye className="w-2.5 h-2.5" /> FRAME_ACQ
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 4. MODAL - DETAILED ALERT CAPTURE VIEW */}
      {selectedAlert && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-neutral-300 w-full max-w-2xl overflow-hidden shadow-2xl relative">
            <div className="bg-red-600 text-white p-3 flex justify-between items-center border-b border-red-700">
              <h4 className="font-bold font-mono text-sm uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> HIGH-PRIORITY FIELD LOG: FILE_ID #{selectedAlert.id}
              </h4>
              <button 
                onClick={() => setSelectedAlert(null)}
                className="text-white hover:text-red-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              {/* Alert Frame Image */}
              {selectedAlert.frame_path ? (
                <div className="bg-black border border-neutral-300 rounded overflow-hidden flex items-center justify-center max-h-[380px]">
                  <img 
                    src={`${API_BASE}/static/alerts/${selectedAlert.frame_path.split(/[\\/]/).pop()}`}
                    alt="Captured Alert Frame"
                    className="max-w-full max-h-[380px] object-contain"
                    onError={(e) => {
                      e.target.src = "https://placehold.co/640x480/090D16/ef4444?text=FRAME+FILE+NOT+FOUND";
                    }}
                  />
                </div>
              ) : (
                <div className="h-40 bg-neutral-100 border border-neutral-200 rounded flex items-center justify-center text-xs text-slate-400 font-mono">
                  NO FRAME CAPTURE ATTACHED
                </div>
              )}

              {/* Info details */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono border-t border-neutral-100 pt-4">
                <div>
                  <span className="block text-slate-400 uppercase text-[9px] mb-0.5">SOURCE DEVICE</span>
                  <span className="font-bold text-slate-800">{selectedAlert.source.toUpperCase()}</span>
                </div>
                <div>
                  <span className="block text-slate-400 uppercase text-[9px] mb-0.5">ALERT TYPE</span>
                  <span className="font-bold text-red-600">{selectedAlert.type}</span>
                </div>
                <div>
                  <span className="block text-slate-400 uppercase text-[9px] mb-0.5">DETECTION CONFIDENCE</span>
                  <span className="font-bold text-red-600">{selectedAlert.confidence.toFixed(2)}%</span>
                </div>
                <div>
                  <span className="block text-slate-400 uppercase text-[9px] mb-0.5">TIMESTAMP LOG</span>
                  <span className="font-bold text-slate-800">{new Date(selectedAlert.timestamp).toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-neutral-50 p-3 rounded border border-neutral-200">
                <span className="block text-[9px] font-bold text-slate-400 mb-1">INCIDENT THREAT DEBRIEF</span>
                <p className="text-xs text-slate-700 leading-relaxed font-semibold">{selectedAlert.message}</p>
              </div>
            </div>

            <div className="bg-neutral-100 p-3 px-5 flex justify-end border-t border-neutral-200">
              <button 
                onClick={() => setSelectedAlert(null)}
                className="btn-outline py-1.5 px-4 text-xs"
              >
                CLOSE ENTRY
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL - THREAT SIMULATION CONTROLS */}
      {showSimPanel && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-neutral-300 w-full max-w-md overflow-hidden shadow-2xl">
            <div className="bg-red-600 text-white p-3 flex justify-between items-center border-b border-red-700">
              <h4 className="font-bold font-mono text-sm uppercase tracking-wider flex items-center gap-2">
                <Play className="w-4 h-4" /> SIMULATE SECURITY INCIDENT
              </h4>
              <button 
                onClick={() => setShowSimPanel(false)}
                className="text-white hover:text-red-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={triggerSimulation} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">TRIGGER SOURCE DEVICE</label>
                <select 
                  value={simSource} 
                  onChange={(e) => setSimSource(e.target.value)}
                  className="w-full p-2 border border-neutral-200 rounded font-mono"
                >
                  <option value="drone-01">DRONE RECON-01</option>
                  <option value="bodycam-03">COMMANDO BODYCAM-03</option>
                  <option value="robot-scout">GROUND BOT SCOUT</option>
                  <option value="webcam">LOCAL STATION WEBCAM</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-600 mb-1">THREAT INCIDENT TYPE</label>
                <select 
                  value={simType} 
                  onChange={(e) => {
                    setSimType(e.target.value);
                    if (e.target.value === 'WEAPON_DETECTED') {
                      setSimMsg('Assault weapon detected in target hand.');
                    } else if (e.target.value === 'WATCHLIST_MATCH') {
                      setSimMsg('Watchlist subject identified: Suspect Alpha');
                    } else if (e.target.value === 'SUSPICIOUS_LOITERING') {
                      setSimMsg('Subject loitering in surveillance zone for 35 seconds');
                    } else {
                      setSimMsg('Suspicious pattern detected in restricted sector.');
                    }
                  }}
                  className="w-full p-2 border border-neutral-200 rounded font-mono"
                >
                  <option value="WEAPON_DETECTED">WEAPON DETECTED</option>
                  <option value="WATCHLIST_MATCH">WATCHLIST MATCH</option>
                  <option value="SUSPICIOUS_LOITERING">SUSPICIOUS LOITERING</option>
                  <option value="SUSPICIOUS_OBJECT">SUSPICIOUS UNATTENDED OBJECT</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-600 mb-1">THREAT DETAILS / MESSAGE</label>
                <input 
                  type="text" 
                  value={simMsg} 
                  onChange={(e) => setSimMsg(e.target.value)}
                  className="w-full p-2 border border-neutral-200 rounded font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-600 mb-1">DETECTION CONFIDENCE (%)</label>
                <input 
                  type="number" 
                  step="0.1" 
                  value={simConf} 
                  onChange={(e) => setSimConf(parseFloat(e.target.value))}
                  className="w-full p-2 border border-neutral-200 rounded font-mono"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowSimPanel(false)} className="btn-outline w-1/2 justify-center py-2">
                  CANCEL
                </button>
                <button type="submit" className="btn-red w-1/2 justify-center py-2">
                  TRIGGER INCIDENT
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
