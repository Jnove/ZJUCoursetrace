/**
 * 今日诗词：首次自动加载，点击刷新带 5 秒冷却。
 */

import { useCallback, useEffect, useRef, useState } from "react";

const POEM_COOLDOWN_MS = 5000; // 5 秒冷却

export type Poem = { content: string; origin: string; author: string };

export function usePoem() {
  const [poem, setPoem] = useState<Poem | null>(null);
  const [poemLoading, setPoemLoading] = useState(false);
  const [poemCooldown, setPoemCooldown] = useState(0); // 剩余冷却秒数
  const poemCooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPoem = useCallback(async () => {
    if (poemLoading || poemCooldown > 0) return;
    setPoemLoading(true);
    try {
      const res = await fetch("https://v1.jinrishici.com/all.json");
      const d = await res.json();
      setPoem({ content: d.content, origin: d.origin, author: d.author });
      // 启动冷却倒计时
      setPoemCooldown(POEM_COOLDOWN_MS / 1000);
      poemCooldownRef.current = setInterval(() => {
        setPoemCooldown(prev => {
          if (prev <= 1) {
            clearInterval(poemCooldownRef.current!);
            poemCooldownRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch { /* 静默失败 */ } finally {
      setPoemLoading(false);
    }
  }, [poemLoading, poemCooldown]);

  // 首次加载诗词
  useEffect(() => {
    fetch("https://v1.jinrishici.com/all.json")
      .then(r => r.json())
      .then(d => setPoem({ content: d.content, origin: d.origin, author: d.author }))
      .catch(() => {});
    return () => {
      if (poemCooldownRef.current) clearInterval(poemCooldownRef.current);
    };
  }, []);

  return { poem, poemLoading, poemCooldown, fetchPoem };
}
