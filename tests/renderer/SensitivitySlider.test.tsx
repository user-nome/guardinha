import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SensitivitySlider } from '@zero/renderer/components/SensitivitySlider';

/** Trava o slider acessível e o clamping; o jsdom não tem Pointer Capture, daí o stub. */

const CAPTURE = {
  setPointerCapture: vi.fn(),
  releasePointerCapture: vi.fn(),
  hasPointerCapture: vi.fn<() => boolean>(() => true),
};

beforeAll(() => {
  for (const [name, value] of Object.entries(CAPTURE)) {
    Object.defineProperty(Element.prototype, name, { value, configurable: true });
  }
});

afterAll(() => {
  for (const name of Object.keys(CAPTURE)) {
    Reflect.deleteProperty(Element.prototype, name);
  }
});

function setup(value = 10, min = 0, max = 20): { onChange: ReturnType<typeof vi.fn> } {
  const onChange = vi.fn<(next: number) => void>();
  render(
    <SensitivitySlider value={value} min={min} max={max} label="Tamanho" onChange={onChange} />,
  );
  return { onChange };
}

function slider(): HTMLElement {
  return screen.getByRole('slider', { name: 'Tamanho' });
}

describe('SensitivitySlider: teclado', () => {
  it('expõe valor, mínimo e máximo para a tecnologia assistiva', () => {
    setup(10, 0, 20);
    expect(slider()).toHaveAttribute('aria-valuenow', '10');
    expect(slider()).toHaveAttribute('aria-valuemin', '0');
    expect(slider()).toHaveAttribute('aria-valuemax', '20');
    expect(slider()).toHaveAttribute('tabindex', '0');
  });

  it('as setas movem um passo', () => {
    const { onChange } = setup(10);
    fireEvent.keyDown(slider(), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(11);
    fireEvent.keyDown(slider(), { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledWith(11);
    fireEvent.keyDown(slider(), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith(9);
    fireEvent.keyDown(slider(), { key: 'ArrowDown' });
    expect(onChange).toHaveBeenCalledWith(9);
  });

  it('cada seta vertical move exatamente um passo', () => {
    // cada tecla é medida sozinha: o espião acumula e um passo de dois passaria
    const { onChange } = setup(10);
    fireEvent.keyDown(slider(), { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(11);

    onChange.mockClear();
    fireEvent.keyDown(slider(), { key: 'ArrowDown' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(9);
  });

  it('PageUp e PageDown movem dez', () => {
    const { onChange } = setup(10);
    fireEvent.keyDown(slider(), { key: 'PageUp' });
    expect(onChange).toHaveBeenCalledWith(20);
    fireEvent.keyDown(slider(), { key: 'PageDown' });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('PageUp e PageDown movem dez longe das pontas, sem o clamp esconder o passo', () => {
    // faixa larga: na estreita o clamp esconderia o passo e a asserção passaria
    const { onChange } = setup(50, 0, 100);
    fireEvent.keyDown(slider(), { key: 'PageUp' });
    expect(onChange).toHaveBeenLastCalledWith(60);

    fireEvent.keyDown(slider(), { key: 'PageDown' });
    expect(onChange).toHaveBeenLastCalledWith(40);
  });

  it('Home e End vão às pontas', () => {
    const { onChange } = setup(10);
    fireEvent.keyDown(slider(), { key: 'Home' });
    expect(onChange).toHaveBeenCalledWith(0);
    fireEvent.keyDown(slider(), { key: 'End' });
    expect(onChange).toHaveBeenCalledWith(20);
  });

  it('não deixa o valor cair abaixo do mínimo', () => {
    const { onChange } = setup(1, 0, 20);
    fireEvent.keyDown(slider(), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('não deixa o valor passar do máximo', () => {
    const { onChange } = setup(19, 0, 20);
    fireEvent.keyDown(slider(), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(20);
  });

  it('ignora tecla que não mexe no valor', () => {
    const { onChange } = setup(10);
    fireEvent.keyDown(slider(), { key: 'a' });
    fireEvent.keyDown(slider(), { key: 'Tab' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('trata faixa degenerada sem dividir por zero', () => {
    // min == max quebraria `width / (max - min)`; o `Math.max(1, ...)` segura
    const { onChange } = setup(5, 5, 5);
    expect(() => {
      fireEvent.keyDown(slider(), { key: 'ArrowRight' });
    }).not.toThrow();
    expect(onChange).toHaveBeenCalledWith(5);
  });
});

describe('SensitivitySlider: arraste', () => {
  it('muda o valor proporcionalmente ao arrasto', () => {
    const { onChange } = setup(0, 0, 48);
    fireEvent.pointerDown(slider(), { clientX: 0, pointerId: 1 });
    // passo mínimo de 10 px: 100 px de arraste valem 10 unidades
    fireEvent.pointerMove(slider(), { clientX: 100, pointerId: 1 });
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it('não move nada sem arraste em curso', () => {
    const { onChange } = setup(10, 0, 20);
    fireEvent.pointerMove(slider(), { clientX: 500, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignora o movimento que volta ao mesmo valor', () => {
    const { onChange } = setup(10, 0, 20);
    fireEvent.pointerDown(slider(), { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(slider(), { clientX: 0, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('termina o arraste no clique e no cancelamento, sem erro', () => {
    setup(10, 0, 20);
    expect(() => {
      fireEvent.pointerUp(slider(), { clientX: 10, pointerId: 1 });
      fireEvent.pointerDown(slider(), { clientX: 10, pointerId: 1 });
      fireEvent.pointerCancel(slider(), { clientX: 10, pointerId: 1 });
    }).not.toThrow();
  });

  it('arraste não foge da faixa', () => {
    const { onChange } = setup(5, 0, 20);
    fireEvent.pointerDown(slider(), { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(slider(), { clientX: 10_000, pointerId: 1 });
    expect(onChange).toHaveBeenCalledWith(20);
  });

  it('calcula o passo pela largura real da faixa', () => {
    // 480 px para 48 unidades dão 10 px por unidade; com multiplicação nada moveria
    const { onChange } = setup(0, 0, 48);
    Object.defineProperty(slider(), 'clientWidth', { value: 480, configurable: true });
    fireEvent.pointerDown(slider(), { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(slider(), { clientX: 100, pointerId: 1 });

    expect(onChange).toHaveBeenCalledWith(10);
  });

  it('o passo usa a distância entre mínimo e máximo, não a soma', () => {
    // faixa 10..20 em 300 px: 30 px por unidade; somar as pontas daria 10
    const { onChange } = setup(10, 10, 20);
    Object.defineProperty(slider(), 'clientWidth', { value: 300, configurable: true });
    fireEvent.pointerDown(slider(), { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(slider(), { clientX: 30, pointerId: 1 });

    expect(onChange).toHaveBeenCalledWith(11);
  });

  it('mede o arraste a partir do ponto em que o ponteiro desceu', () => {
    // O arraste é relativo: `clientX - startX`, nunca a soma dos dois.
    const { onChange } = setup(5, 0, 20);
    Object.defineProperty(slider(), 'clientWidth', { value: 200, configurable: true });
    fireEvent.pointerDown(slider(), { clientX: 50, pointerId: 1 });
    fireEvent.pointerMove(slider(), { clientX: 100, pointerId: 1 });

    expect(onChange).toHaveBeenCalledWith(10);
  });

  it('põe o preenchimento na fração exata do valor na faixa', () => {
    setup(15, 10, 20);
    const fill = slider().firstElementChild;
    const knob = slider().lastElementChild;
    if (!(fill instanceof HTMLElement) || !(knob instanceof HTMLElement)) {
      throw new Error('trilho sem preenchimento ou botão');
    }

    expect(fill).toHaveStyle({ width: '50%' });
    expect(knob).toHaveStyle({ left: '50%' });
  });

  it('na faixa de uma unidade, o máximo cobre a barra inteira', () => {
    setup(1, 0, 1);
    const fill = slider().firstElementChild;
    if (!(fill instanceof HTMLElement)) throw new Error('trilho sem preenchimento');

    expect(fill).toHaveStyle({ width: '100%' });
  });

  it('na faixa de uma unidade, o passo é a largura inteira da faixa', () => {
    // com `max - min` 1 o passo é a largura toda; o piso do `Math.max` é para a degenerada
    const { onChange } = setup(0, 0, 1);
    Object.defineProperty(slider(), 'clientWidth', { value: 200, configurable: true });
    fireEvent.pointerDown(slider(), { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(slider(), { clientX: 50, pointerId: 1 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('soltar o ponteiro sem arraste não solta captura nenhuma', () => {
    CAPTURE.releasePointerCapture.mockClear();
    setup(10, 0, 20);

    fireEvent.pointerUp(slider(), { clientX: 10, pointerId: 9 });

    expect(CAPTURE.releasePointerCapture).not.toHaveBeenCalled();
  });

  it('soltar depois do arraste encerra o estado e solta a captura', () => {
    CAPTURE.releasePointerCapture.mockClear();
    const { onChange } = setup(10, 0, 20);
    fireEvent.pointerDown(slider(), { clientX: 0, pointerId: 9 });
    fireEvent.pointerUp(slider(), { clientX: 0, pointerId: 9 });
    expect(CAPTURE.releasePointerCapture).toHaveBeenCalledTimes(1);

    onChange.mockClear();
    fireEvent.pointerMove(slider(), { clientX: 100, pointerId: 9 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('termina o arraste sem soltar captura que o elemento não tem', () => {
    // soltar captura inexistente lança `NotFoundError`, que subiria no fim do arraste
    CAPTURE.hasPointerCapture.mockReturnValueOnce(false);
    CAPTURE.releasePointerCapture.mockClear();
    setup(10, 0, 20);
    fireEvent.pointerDown(slider(), { clientX: 0, pointerId: 7 });

    expect(() => {
      fireEvent.pointerUp(slider(), { clientX: 0, pointerId: 7 });
    }).not.toThrow();
    expect(CAPTURE.releasePointerCapture).not.toHaveBeenCalled();
  });
});
