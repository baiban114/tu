import { describe, it, expect } from 'vitest';
import { Model, History } from '@antv/x6';

/**
 * Mirrors dissolveBoardGroup() in X6Component.vue. getChildren() returns null
 * when the container is empty or was already detached (e.g. nested groups
 * selected together: dissolving a child group removes it from the outer
 * container's children store before the outer's turn), so it must tolerate null.
 */
function dissolveBoardGroup(container: any) {
  const children = container.getChildren() ?? [];
  children.forEach((child: any) => container.unembed(child));
  container.remove();
}

function setupHistory(model: Model) {
  const history = new History();
  const graphStub: any = {
    model,
    // History.init only needs graph.model; the graph.trigger forwarded events
    // are not observed by this test, so keep a no-op (emit is protected).
    trigger: () => {},
  };
  history.init(graphStub);
  return history;
}

function describeCells(model: Model) {
  return model.getCells()
    .map((c: any) => {
      const parent = c.getParent ? c.getParent() : null;
      return { id: c.id, parent: parent ? parent.id : null };
    })
    .sort((x: any, y: any) => x.id.localeCompare(y.id));
}

describe('board group undo via X6 history batch', () => {
  it('undoes group (embed + container add) and ungroup in single steps', () => {
    const model = new Model();
    const history = setupHistory(model);

    const a = model.addNode({ id: 'a', shape: 'rect', x: 0, y: 0, width: 10, height: 10 });
    const b = model.addNode({ id: 'b', shape: 'rect', x: 20, y: 20, width: 10, height: 10 });

    // groupSelection()
    model.startBatch('update');
    const container = model.addNode({ id: 'grp', shape: 'rect', x: -5, y: -5, width: 40, height: 40 });
    container.embed(a);
    container.embed(b);
    model.stopBatch('update');

    expect(describeCells(model)).toEqual([
      { id: 'a', parent: 'grp' },
      { id: 'b', parent: 'grp' },
      { id: 'grp', parent: null },
    ]);
    expect(history.canUndo()).toBe(true);

    // Single undo removes the container and unembeds members
    history.undo();
    const afterUndo = describeCells(model);
    expect(a.getParent()).toBeNull();
    expect(b.getParent()).toBeNull();
    expect(afterUndo.find((c: any) => c.id === 'grp')).toBeUndefined();

    // Redo restores the group
    history.redo();
    const afterRedo = describeCells(model);
    expect(afterRedo.find((c: any) => c.id === 'grp')).toBeDefined();
    expect(afterRedo.find((c: any) => c.id === 'a')!.parent).toBe('grp');

    // ungroupSelection()
    const containerAgain = model.getCell('grp') as any;
    expect(containerAgain).toBeDefined();
    model.startBatch('update');
    containerAgain.getChildren().forEach((child: any) => containerAgain.unembed(child));
    containerAgain.remove();
    model.stopBatch('update');

    expect(describeCells(model)).toEqual([
      { id: 'a', parent: null },
      { id: 'b', parent: null },
    ]);

    history.undo();
    const afterUngroupUndo = describeCells(model);
    expect(afterUngroupUndo.find((c: any) => c.id === 'grp')).toBeDefined();
    expect(afterUngroupUndo.find((c: any) => c.id === 'a')!.parent).toBe('grp');
  });

  it('dissolves nested groups selected together without crashing on null children', () => {
    const model = new Model();
    model.addNode({ id: 'a', shape: 'rect', x: 0, y: 0, width: 10, height: 10 });
    model.addNode({ id: 'b', shape: 'rect', x: 20, y: 20, width: 10, height: 10 });
    const inner = model.addNode({ id: 'inner', shape: 'rect', x: 0, y: 0, width: 40, height: 40, data: { boardGroup: true } });
    const outer = model.addNode({ id: 'outer', shape: 'rect', x: -5, y: -5, width: 80, height: 80, data: { boardGroup: true } });
    (model.getCell('a') as any).setParent(inner);
    (model.getCell('b') as any).setParent(inner);
    inner.setParent(outer);

    expect(describeCells(model)).toEqual([
      { id: 'a', parent: 'inner' },
      { id: 'b', parent: 'inner' },
      { id: 'inner', parent: 'outer' },
      { id: 'outer', parent: null },
    ]);

    // Odd selection order: inner (child) dissolver runs before outer. Its
    // remove() detaches it from outer, so outer.getChildren() is null when
    // its turn comes. Must not throw.
    expect(() => {
      model.startBatch('update');
      dissolveBoardGroup(inner);
      dissolveBoardGroup(outer);
      model.stopBatch('update');
    }).not.toThrow();

    expect(describeCells(model)).toEqual([
      { id: 'a', parent: null },
      { id: 'b', parent: null },
    ]);
  });

  it('dissolves an empty group container gracefully', () => {
    const model = new Model();
    model.addNode({ id: 'empty', shape: 'rect', x: 0, y: 0, width: 10, height: 10, data: { boardGroup: true } });

    expect(() => dissolveBoardGroup(model.getCell('empty'))).not.toThrow();
    expect(describeCells(model)).toEqual([]);
  });
});