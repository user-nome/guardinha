import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SensitivitySlider } from '@zero/renderer/components/SensitivitySlider';

/**
 * O slider implementa `role="slider"` com arraste relativo (o clique não pula
 * o cursor para o ponto clicado) e passo em pixels com piso de 10 px. Os testes
 * abaixo travam o comportamento acessível por teclado, que é o caminho de quem
 * não usa mouse, e as bordas de clamping.
 *
 * O jsdom não implementa a Pointer Capture API, que o componente usa para
 * continuar recebendo o arraste fora da barra. Sem o stub, `setPointerCapture`
 * lança e o arraste nunca começa, então os testes de ponteiro medem o erro do
 * ambiente em vez do componente.
 */

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
    // Cada tecla é medida sozinha: o espião acumula chamadas, e sem separar
    // ArrowUp de ArrowRight um passo de dois passaria na asserção só porque o
    // ArrowRight anterior devolveu o valor certo.
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
    // Com a faixa estreita dos testes acima, um passo de onze seria cortado no
    // máximo e a asserção passaria de qualquer jeito. A faixa larga mede o passo
    // de verdade.
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
});
