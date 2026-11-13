import { useEffect, useRef, useState } from 'react';

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Die({ value, rolling }: { value: number; rolling: boolean }) {
  return (
    <div className={`die ${rolling ? 'rolling' : ''}`} aria-label={`Die showing ${value}`}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={PIPS[value]?.includes(i) ? 'pip on' : 'pip'} />
      ))}
    </div>
  );
}

export function Dice({ dice, rollId }: { dice: [number, number] | null; rollId: number }) {
  const [faces, setFaces] = useState<[number, number]>(dice ?? [5, 2]);
  const [rolling, setRolling] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (!dice) return;
    if (first.current) {
      first.current = false;
      setFaces(dice);
      return;
    }
    setRolling(true);
    let n = 0;
    const timer = setInterval(() => {
      n++;
      if (n >= 7) {
        clearInterval(timer);
        setFaces(dice);
        setRolling(false);
      } else setFaces([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
    }, 70);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollId]);

  return (
    <div className="dice">
      <Die value={faces[0]} rolling={rolling} />
      <Die value={faces[1]} rolling={rolling} />
    </div>
  );
}
