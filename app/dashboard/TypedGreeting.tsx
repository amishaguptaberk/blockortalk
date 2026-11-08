'use client';

import { useEffect, useState } from 'react';

export default function TypedGreeting({ name }: { name: string }) {
  const message = `Good to see you, ${name}.`;
  const [visible, setVisible] = useState('');
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const characters = Array.from(message);
    let count = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    const finish = () => { clearInterval(timer); setVisible(message); };
    if (preference.matches) finish();
    else {
      setVisible('');
      timer = setInterval(() => {
        count += 1;
        setVisible(characters.slice(0, count).join(''));
        if (count >= characters.length) clearInterval(timer);
      }, 40);
    }
    preference.addEventListener('change', finish);
    return () => { clearInterval(timer); preference.removeEventListener('change', finish); };
  }, [message]);
  return <p className="hub-greeting" aria-label={message}><span aria-hidden="true">{visible}{visible !== message && <span className="greeting-caret">▏</span>}</span></p>;
}
