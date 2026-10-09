// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NumberField } from '../entrypoints/sidepanel/fields';

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
