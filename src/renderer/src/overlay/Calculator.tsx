import React, { useEffect, useState } from 'react';

type Op = '+' | '-' | '×' | '÷';

interface Props { onClose: () => void; }

export const Calculator: React.FC<Props> = ({ onClose }) => {
  const [display, setDisplay] = useState('0');
  const [acc, setAcc] = useState<number | null>(null);
  const [pendingOp, setPendingOp] = useState<Op | null>(null);
  const [history, setHistory] = useState('');
  const [justEvaluated, setJustEvaluated] = useState(false);

  function inputDigit(d: string) {
    if (justEvaluated) {
      setDisplay(d);
      setHistory('');
      setJustEvaluated(false);
      return;
    }
    setDisplay(prev => (prev === '0' ? d : prev + d));
  }

  function inputDot() {
    if (justEvaluated) { setDisplay('0.'); setHistory(''); setJustEvaluated(false); return; }
    setDisplay(prev => prev.includes('.') ? prev : prev + '.');
  }

  function clearAll() {
    setDisplay('0'); setAcc(null); setPendingOp(null); setHistory(''); setJustEvaluated(false);
  }

  function applyOp(a: number, b: number, op: Op): number {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? NaN : a / b;
    }
  }

  function pressOp(op: Op) {
    const cur = parseFloat(display);
    if (acc === null) {
      setAcc(cur);
      setHistory(`${formatNum(cur)} ${op}`);
    } else if (pendingOp && !justEvaluated) {
      const r = applyOp(acc, cur, pendingOp);
      setAcc(r);
      setDisplay(formatNum(r));
      setHistory(`${formatNum(r)} ${op}`);
    } else {
      setHistory(`${formatNum(acc)} ${op}`);
    }
    setPendingOp(op);
    setJustEvaluated(false);
    // Next digit starts new number
    setDisplay(prev => justEvaluated ? prev : prev); // no-op; handled by digit reset
    // Actually we need to flag that the next digit replaces display:
    setReplaceOnNext(true);
  }

  // small extra state to handle "after operator, next digit replaces"
  const [replaceOnNext, setReplaceOnNext] = useState(false);
  function inputDigitGated(d: string) {
    if (replaceOnNext) {
      setDisplay(d === '.' ? '0.' : d);
      setReplaceOnNext(false);
      return;
    }
    if (d === '.') inputDot(); else inputDigit(d);
  }

  function equals() {
    if (acc === null || pendingOp === null) return;
    const cur = parseFloat(display);
    const r = applyOp(acc, cur, pendingOp);
    setHistory(`${formatNum(acc)} ${pendingOp} ${formatNum(cur)} =`);
    setDisplay(formatNum(r));
    setAcc(null);
    setPendingOp(null);
    setJustEvaluated(true);
    setReplaceOnNext(false);
  }

  function negate() {
    setDisplay(prev => {
      if (prev.startsWith('-')) return prev.slice(1);
      if (prev === '0') return prev;
      return '-' + prev;
    });
  }

  function percent() {
    setDisplay(prev => formatNum(parseFloat(prev) / 100));
  }

  function backspace() {
    if (justEvaluated) { clearAll(); return; }
    setDisplay(prev => {
      if (prev.length <= 1 || (prev.length === 2 && prev.startsWith('-'))) return '0';
      return prev.slice(0, -1);
    });
  }

  // Keyboard support
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key;
      if (k >= '0' && k <= '9') inputDigitGated(k);
      else if (k === '.') inputDigitGated('.');
      else if (k === '+' || k === '-') pressOp(k as Op);
      else if (k === '*') pressOp('×');
      else if (k === '/') pressOp('÷');
      else if (k === 'Enter' || k === '=') equals();
      else if (k === 'Backspace') backspace();
      else if (k === 'Escape') onClose();
      else if (k.toLowerCase() === 'c') clearAll();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acc, pendingOp, display, justEvaluated, replaceOnNext]);

  return (
    <div className="widget calc-widget" onClick={e => e.stopPropagation()}>
      <div className="widget-header">
        <span className="title">Calculator</span>
        <div className="actions">
          <button className="ghost icon" onClick={onClose} title="Close">×</button>
        </div>
      </div>
      <div className="calc-display">
        <div className="calc-history">{history}&nbsp;</div>
        <div className="calc-value">{display}</div>
      </div>
      <div className="calc-grid">
        <button className="calc-btn clear" onClick={clearAll}>C</button>
        <button className="calc-btn" onClick={negate}>±</button>
        <button className="calc-btn" onClick={percent}>%</button>
        <button className="calc-btn op" onClick={() => pressOp('÷')}>÷</button>

        <button className="calc-btn" onClick={() => inputDigitGated('7')}>7</button>
        <button className="calc-btn" onClick={() => inputDigitGated('8')}>8</button>
        <button className="calc-btn" onClick={() => inputDigitGated('9')}>9</button>
        <button className="calc-btn op" onClick={() => pressOp('×')}>×</button>

        <button className="calc-btn" onClick={() => inputDigitGated('4')}>4</button>
        <button className="calc-btn" onClick={() => inputDigitGated('5')}>5</button>
        <button className="calc-btn" onClick={() => inputDigitGated('6')}>6</button>
        <button className="calc-btn op" onClick={() => pressOp('-')}>−</button>

        <button className="calc-btn" onClick={() => inputDigitGated('1')}>1</button>
        <button className="calc-btn" onClick={() => inputDigitGated('2')}>2</button>
        <button className="calc-btn" onClick={() => inputDigitGated('3')}>3</button>
        <button className="calc-btn op" onClick={() => pressOp('+')}>+</button>

        <button className="calc-btn span2" onClick={() => inputDigitGated('0')}>0</button>
        <button className="calc-btn" onClick={() => inputDigitGated('.')}>.</button>
        <button className="calc-btn equals" onClick={equals}>=</button>
      </div>
    </div>
  );
};

function formatNum(n: number): string {
  if (!isFinite(n)) return 'Error';
  // Trim long decimals
  const s = Number.isInteger(n) ? String(n) : Number(n.toPrecision(12)).toString();
  return s;
}
