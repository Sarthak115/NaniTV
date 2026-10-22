import { useEffect, useState } from 'react';
import type { Household } from '../lib/types';
import { useNow } from './HomeScreen';

export interface FramePhoto {
  id: string;
  url: string;
  from: string;
  caption: string | null;
}

const SLIDE_MS = 9000;

/** Idle slideshow of family photos. TvApp swallows the first key press to return home. */
export default function PhotoFrame({ household, photos }: { household: Household; photos: FramePhoto[] }) {
  const hi = household.language === 'hi';
  const [i, setI] = useState(0);
  const now = useNow(15000);

  useEffect(() => {
    if (photos.length < 2) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % photos.length), SLIDE_MS);
    return () => window.clearInterval(t);
  }, [photos.length]);

  const time = now.toLocaleTimeString('en-IN', { timeZone: household.timezone, hour: 'numeric', minute: '2-digit', hour12: true });

  if (!photos.length) {
    return (
      <div className="frame frame-empty">
        <div className="frame-big-clock">{time}</div>
        <div className="tv-sub">{hi ? 'Parivaar aapke saath hai ❤️' : 'Your family is with you ❤️'}</div>
      </div>
    );
  }

  const p = photos[i % photos.length];
  return (
    <div className="frame">
      {photos.map((ph, j) => (
        <div key={ph.id} className={`frame-slide${j === i % photos.length ? ' on' : ''}`}>
          <div className="viewer-photo-bg" style={{ backgroundImage: `url(${ph.url})` }} />
          <img className="frame-img" src={ph.url} alt="" />
        </div>
      ))}
      <div className="frame-caption">
        <span className="frame-from">❤️ {hi ? `${p.from} ki taraf se` : `From ${p.from}`}</span>
        {p.caption && <span className="frame-text">{p.caption}</span>}
      </div>
      <div className="frame-clock">{time}</div>
    </div>
  );
}
