// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AreaField, NumberField, TextField } from '../entrypoints/sidepanel/fields';

afterEach(cleanup);

describe('NumberField', () => {
  it('commits once on Enter + blur', () => {
    const onValue = vi.fn();
    render(<NumberField aria-label="n" value="5" onValue={onValue} />);
    const el = screen.getByLabelText('n');
    fireEvent.focus(el);
    fireEvent.change(el, { target: { value: '7' } });
    fireEvent.keyDown(el, { key: 'Enter' });
    fireEvent.blur(el);
    expect(onValue).toHaveBeenCalledTimes(1);
    expect(onValue).toHaveBeenCalledWith('7');
  });

  it('a committed value that the parent normalises shows the stored value once `value` changes', () => {
    const onValue = vi.fn();
    const { rerender } = render(<NumberField aria-label="n" value="5" onValue={onValue} />);
    const el = screen.getByLabelText('n') as HTMLInputElement;
    fireEvent.focus(el);
    fireEvent.change(el, { target: { value: '99' } });
    fireEvent.blur(el);
    expect(onValue).toHaveBeenCalledWith('99');
    rerender(<NumberField aria-label="n" value="10" onValue={onValue} />); // clamped
    expect(el.value).toBe('10');
  });

  it('retyping the same value after the parent rejected it commits again', () => {
    const onValue = vi.fn();
    render(<NumberField aria-label="n" value="5" onValue={onValue} />);
    const el = screen.getByLabelText('n') as HTMLInputElement;
    fireEvent.focus(el);
    fireEvent.change(el, { target: { value: '99' } });
    fireEvent.keyDown(el, { key: 'Enter' }); // rejected: value stays "5"
    fireEvent.change(el, { target: { value: '5' } });
    fireEvent.change(el, { target: { value: '99' } });
    fireEvent.keyDown(el, { key: 'Enter' });
    expect(onValue).toHaveBeenCalledTimes(2);
  });

  it('blur shows the stored value when the parent rejects/normalises it back', () => {
    const onValue = vi.fn();
    render(<NumberField aria-label="n" value="5" onValue={onValue} />);
    const el = screen.getByLabelText('n') as HTMLInputElement;
    fireEvent.focus(el);
    fireEvent.change(el, { target: { value: '99' } });
    fireEvent.blur(el); // the parent keeps value "5"
    expect(onValue).toHaveBeenCalledWith('99');
    expect(el.value).toBe('5');
  });
});

// The run moves the schedule start after each upload (queue-runner: settings.schedule.start =
// next slot); a field focused at that moment must show the new start once it is left, or a
// nudge of its minutes writes the old day back (final review I2).
describe('TextField / AreaField follow the stored value', () => {
  const day1 = '2026-10-10T08:00';
  const day2 = '2026-10-11T08:00';
  it('a value changed elsewhere while focused shows on blur (the schedule start during a run)', () => {
    const onValue = vi.fn();
    const { rerender } = render(<TextField type="datetime-local" aria-label="start" value={day1} onValue={onValue} />);
    const el = screen.getByLabelText('start') as HTMLInputElement;
    fireEvent.focus(el);
    rerender(<TextField type="datetime-local" aria-label="start" value={day2} onValue={onValue} />);
    expect(el.value).toBe(day1); // not while the user is in it
    fireEvent.blur(el);
    expect(el.value).toBe(day2);
    expect(onValue).not.toHaveBeenCalled();
  });

  it('the same for AreaField', () => {
    const { rerender } = render(<AreaField aria-label="a" value="old" onValue={() => {}} />);
    const el = screen.getByLabelText('a') as HTMLTextAreaElement;
    fireEvent.focus(el);
    rerender(<AreaField aria-label="a" value="new" onValue={() => {}} />);
    fireEvent.blur(el);
    expect(el.value).toBe('new');
  });

  it('a late echo of the user\'s own typing does not flash an older text on blur', () => {
    const { rerender } = render(<TextField aria-label="t" value="" onValue={() => {}} />);
    const el = screen.getByLabelText('t') as HTMLInputElement;
    fireEvent.focus(el);
    fireEvent.change(el, { target: { value: 'a' } });
    fireEvent.change(el, { target: { value: 'ab' } });
    rerender(<TextField aria-label="t" value="a" onValue={() => {}} />); // the first keystroke, stored
    fireEvent.blur(el);
    expect(el.value).toBe('ab');
  });

  it('typing after a change from elsewhere keeps what the user typed', () => {
    const onValue = vi.fn();
    const { rerender } = render(<TextField aria-label="t" value="x" onValue={onValue} />);
    const el = screen.getByLabelText('t') as HTMLInputElement;
    fireEvent.focus(el);
    rerender(<TextField aria-label="t" value="y" onValue={onValue} />);
    fireEvent.change(el, { target: { value: 'xz' } });
    fireEvent.blur(el);
    expect(el.value).toBe('xz');
    expect(onValue).toHaveBeenCalledWith('xz');
  });
});
