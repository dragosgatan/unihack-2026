import { act, screen } from '@testing-library/react';

let pressedAt = 0;

export const press = (target: string | RegExp | HTMLElement) => {
  const click = new MouseEvent('click', { bubbles: true, detail: 0 });
  pressedAt += 1000;
  Object.defineProperty(click, 'timeStamp', { value: pressedAt });
  act(() => {
    (target instanceof HTMLElement ? target : screen.getByRole('button', { name: target })).dispatchEvent(click);
  });
};
