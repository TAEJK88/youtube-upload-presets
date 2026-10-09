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

  it('on blur shows the stored value again when it was normalised back', () => {
    const onValue = vi.fn();
    render(<NumberField aria-label="n" value="5" onValue={onValue} />);
    const el = screen.getByLabelText('n') as HTMLInputElement;
    fireEvent.focus(el);
    fireEvent.change(el, { target: { value: '99' } });
    fireEvent.blur(el); // the parent normalises it back to "5": value never changes
    expect(onValue).toHaveBeenCalledWith('99');
    expect(el.value).toBe('5');
  });
});
