import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  Volume1,
  VolumeX,
  Sparkles,
  Download,
  Headphones,
  AudioWaveform,
  FileText,
  ChevronDown,
  ChevronUp,
  Radio,
  RefreshCw
} from 'lucide-react';

export interface PodcastPlayerProps {
  src: string;
  title?: string;
  subtitle?: string;
  hostNames?: string[];
  transcript?: string;
  autoPlay?: boolean;
  onEnded?: () => void;
  onRegenerate?: () => void;
  className?: string;
}

export const PodcastPlayer: React.FC<PodcastPlayerProps> = ({
  src,
  title = "AI Academic Seminar & Revision Podcast",
  subtitle = "Generated AI Study Companion",
  hostNames = ["AI Prof. Alpha", "AI Prof. Beta"],
  transcript,
  autoPlay = false,
  onEnded,
  onRegenerate,
  className = ""
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [showTranscript, setShowTranscript] = useState<boolean>(false);
  const [isHoveringProgress, setIsHoveringProgress] = useState<boolean>(false);

  const speedOptions = [0.75, 1.0, 1.25, 1.5, 2.0];

  // Initialize playback & listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (onEnded) onEnded();
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    // If already loaded
    if (audio.readyState >= 1) {
      setDuration(audio.duration || 0);
    }

    if (autoPlay) {
      audio.play().catch(err => console.warn("Autoplay blocked:", err));
    }

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [src, autoPlay, onEnded]);

  // Speech synthesis helper
  const speakTranscript = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && transcript) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        return;
      }
      if (!window.speechSynthesis.speaking) {
        const cleanText = transcript.replace(/(Joe|Jane|Professor|Student):/gi, '$1 says,');
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = playbackRate;
        utterance.volume = isMuted ? 0 : volume;
        window.speechSynthesis.speak(utterance);
      }
    }
  };

  const pauseSpeech = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
      }
    }
  };

  // Toggle Play / Pause
  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      pauseSpeech();
    } else {
      audio.play().then(() => {
        speakTranscript();
      }).catch(err => {
        console.warn("Audio playback handling fallback:", err);
        speakTranscript();
        setIsPlaying(true);
      });
    }
  };

  // Skip backwards / forwards
  const skipTime = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newTime = Math.min(Math.max(audio.currentTime + seconds, 0), duration);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Seek progress
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Change Speed
  const handleSpeedChange = () => {
    const currentIndex = speedOptions.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % speedOptions.length;
    const nextSpeed = speedOptions[nextIndex];
    setPlaybackRate(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  // Change Volume
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
      audioRef.current.muted = newVol === 0;
      setIsMuted(newVol === 0);
    }
  };

  // Toggle Mute
  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isMuted) {
      audio.muted = false;
      setIsMuted(false);
      audio.volume = volume || 1;
    } else {
      audio.muted = true;
      setIsMuted(true);
    }
  };

  // Format Time Helper
  const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds) || timeInSeconds <= 0) return '00:00';
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`w-full bg-slate-900 text-white rounded-[2.5rem] p-6 sm:p-10 shadow-2xl border border-slate-800 relative overflow-hidden ${className}`}>
      {/* Hidden HTML Audio Element */}
      <audio ref={audioRef} src={src || undefined} preload="metadata" />

      {/* Background Decorative Blur & Wave Accent */}
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Header / Title Badge */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <Headphones size={22} className={isPlaying ? "animate-pulse" : ""} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Radio size={12} className={isPlaying ? "animate-pulse text-blue-400" : ""} />
                AI Podcast Stream
              </span>
              {isPlaying && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 uppercase tracking-wider animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Live Playing
                </span>
              )}
            </div>
            <h3 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-tight mt-1">
              {title}
            </h3>
            <p className="text-xs text-slate-400 font-medium">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Action Controls: Download / Transcript toggle / Regenerate */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-bold transition-all"
              title="Regenerate Podcast with AI"
            >
              <RefreshCw size={14} />
              <span>New Podcast</span>
            </button>
          )}

          {transcript && (
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                showTranscript
                  ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-500/20'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="Toggle Transcript"
            >
              <FileText size={14} />
              <span>Transcript</span>
              {showTranscript ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}

          {src && (
            <a
              href={src}
              download="scolaris-ai-podcast.wav"
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all border border-slate-700"
              title="Download Audio Stream"
            >
              <Download size={16} />
            </a>
          )}
        </div>
      </div>

      {/* Animated Waveform Visualizer & Hosts Banner */}
      <div className="relative z-10 bg-slate-800/60 rounded-3xl p-6 sm:p-8 mb-8 border border-slate-700/60 flex flex-col items-center gap-6">
        <div className="flex items-center justify-center gap-3 text-blue-400 font-bold text-lg sm:text-xl tracking-tight">
          <span>{hostNames[0] || "AI Host Alpha"}</span>
          <AudioWaveform size={26} className={`text-indigo-400 ${isPlaying ? 'animate-bounce' : 'opacity-60'}`} />
          <span>{hostNames[1] || "AI Host Beta"}</span>
        </div>

        {/* Visualizer Bars */}
        <div className="flex items-center justify-center gap-1.5 sm:gap-2 h-16 w-full max-w-md px-4">
          {[40, 75, 30, 90, 55, 80, 45, 100, 60, 85, 35, 95, 50, 70, 40, 80, 65, 30, 90, 45, 75, 50, 85, 35].map((height, i) => (
            <div
              key={i}
              className={`w-1.5 sm:w-2 rounded-full transition-all duration-300 ${
                isPlaying
                  ? 'bg-gradient-to-t from-blue-500 to-indigo-400 animate-pulse'
                  : 'bg-slate-600'
              }`}
              style={{
                height: isPlaying ? `${Math.max(15, (height * (i % 3 === 0 ? 0.9 : 0.6)))}%` : '20%',
                animationDelay: `${(i * 70) % 800}ms`,
                animationDuration: `${600 + (i % 5) * 100}ms`
              }}
            />
          ))}
        </div>
      </div>

      {/* Interactive Progress Bar */}
      <div className="relative z-10 space-y-2 mb-8">
        <div 
          className="relative flex items-center group cursor-pointer"
          onMouseEnter={() => setIsHoveringProgress(true)}
          onMouseLeave={() => setIsHoveringProgress(false)}
        >
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none"
            style={{
              background: `linear-gradient(to right, #3b82f6 ${progressPercent}%, #334155 ${progressPercent}%)`
            }}
          />
        </div>

        {/* Time Counters */}
        <div className="flex items-center justify-between text-xs font-mono text-slate-400 font-semibold px-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Audio Playback Controls */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
        {/* Speed Selector */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSpeedChange}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-xl text-xs font-mono font-bold border border-slate-700 transition-all shadow-sm flex items-center gap-1"
            title="Click to cycle playback speed"
          >
            <Sparkles size={12} />
            <span>{playbackRate.toFixed(2)}x Speed</span>
          </button>
        </div>

        {/* Center Main Transport Controls */}
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Skip Back 10s */}
          <button
            onClick={() => skipTime(-10)}
            className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-2xl transition-all border border-slate-700 active:scale-95"
            title="Rewind 10 Seconds"
          >
            <RotateCcw size={20} />
          </button>

          {/* Play / Pause Toggle */}
          <button
            onClick={togglePlay}
            className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-tr from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-3xl flex items-center justify-center shadow-xl shadow-blue-600/30 active:scale-95 transition-all transform hover:scale-105"
            title={isPlaying ? "Pause Podcast" : "Play Podcast"}
          >
            {isPlaying ? (
              <Pause size={32} className="fill-current" />
            ) : (
              <Play size={32} className="fill-current ml-1" />
            )}
          </button>

          {/* Skip Forward 10s */}
          <button
            onClick={() => skipTime(10)}
            className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-2xl transition-all border border-slate-700 active:scale-95"
            title="Forward 10 Seconds"
          >
            <RotateCw size={20} />
          </button>
        </div>

        {/* Volume Controls */}
        <div className="flex items-center gap-2 min-w-[140px] justify-end">
          <button
            onClick={toggleMute}
            className="p-2 text-slate-400 hover:text-white transition-colors"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted || volume === 0 ? (
              <VolumeX size={20} className="text-red-400" />
            ) : volume < 0.5 ? (
              <Volume1 size={20} />
            ) : (
              <Volume2 size={20} />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-20 sm:w-24 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
            style={{
              background: `linear-gradient(to right, #3b82f6 ${ (isMuted ? 0 : volume) * 100 }%, #334155 ${ (isMuted ? 0 : volume) * 100 }%)`
            }}
          />
        </div>
      </div>

      {/* Transcript Collapsible Panel */}
      {transcript && showTranscript && (
        <div className="relative z-10 mt-8 pt-8 border-t border-slate-800 animate-in fade-in duration-300">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
              <FileText size={16} className="text-blue-400" />
              Podcast Transcript & Script
            </h4>
            <span className="text-[10px] text-slate-400 font-mono">AI Generated Dialogue</span>
          </div>
          <div className="bg-slate-950/80 p-6 rounded-2xl border border-slate-800 max-h-80 overflow-y-auto text-sm text-slate-300 leading-relaxed font-sans space-y-3 whitespace-pre-wrap">
            {transcript}
          </div>
        </div>
      )}
    </div>
  );
};

export default PodcastPlayer;
