import { routerRegistry } from '@antv/x6';

/**
 * 智能 正交路由器。
 *
 * X6 内置的 orth 路由器在两端节点靠得很近时（加了 padding 后包围盒重叠）会走
 * insideNode() 路径，产生不必要的多段弯曲。此自定义路由器在两端节点距离
 * 小于阈值时回退为直线（normal），否则委托给 orth 路由器。
 */

export const ORTH_SMART_ROUTER_NAME = 'orth-smart';

/**
 * 直线路由器（无路由）。
 *
 * 类似 Excalidraw 的默认连线：两端端点之间以直线连接，不做任何正交绕行。
 * 端点可以铆钉在元素任意位置（通过 topLeft 锚点 + dx/dy 比例），
 * 也可以是空白处的自由点 `{ x, y }`。
 */
export const STRAIGHT_ROUTER_NAME = 'straight';

/**
 * 纯直线路由器（无路由、无锚点响应）。
 *
 * 端点始终为自由点 `{ x, y }`，不绑定到任何节点或锚点。
 * 连线就是两点之间的直线，不响应节点移动。
 */
export const LINE_ROUTER_NAME = 'line';

/** 两节点包围盒间隙小于此值（画布坐标系）时回退为直线。 */
export const ORTH_SMART_STRAIGHT_GAP = 20;

interface RectangleBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 判断两个端点节点是否近到不再有足够空间容纳正交路由的中间线段。
 *
 * 使用包围盒的轴向间隙而不是端点距离：这与 X6 判断节点相邻/重叠的
 * 方式一致，也能覆盖上下、左右和斜向靠近的情况。
 */
export function shouldCollapseOrthRoute(
  sourceBBox: RectangleBounds | null | undefined,
  targetBBox: RectangleBounds | null | undefined,
  threshold = ORTH_SMART_STRAIGHT_GAP,
): boolean {
  if (!sourceBBox || !targetBBox) return false;

  const horizontalGap = Math.max(
    sourceBBox.x - (targetBBox.x + targetBBox.width),
    targetBBox.x - (sourceBBox.x + sourceBBox.width),
    0,
  );
  const verticalGap = Math.max(
    sourceBBox.y - (targetBBox.y + targetBBox.height),
    targetBBox.y - (sourceBBox.y + sourceBBox.height),
    0,
  );

  return horizontalGap <= threshold && verticalGap <= threshold;
}

let registered = false;

/**
 * 注册 orth-smart 路由器（幂等）。必须在 Graph 创建前调用。
 */
export function ensureOrthSmartRouterRegistered(): void {
  if (registered) return;

  const orth = routerRegistry.get('orth');

  routerRegistry.register(
    ORTH_SMART_ROUTER_NAME,
    (vertices: any[], options: any, edgeView: any) => {
      const sourceBBox = edgeView.sourceBBox;
      const targetBBox = edgeView.targetBBox;

      // 两节点包围盒重叠或间隙过小 → 直线，避免 orth 的 insideNode 强制绕行。
      // 返回原始 vertices 等同于 normal 路由：默认边没有手工顶点，因此自动
      // 绕行拐点会消失；已有的有效手工顶点仍会被保留。
      if (shouldCollapseOrthRoute(sourceBBox, targetBBox)) {
        return vertices;
      }

      return orth ? orth.call(edgeView, vertices, options, edgeView) : vertices;
    },
    true,
  );

  // 直线路由器：直接返回原始顶点，不做任何正交绕行。
  // 端点位置由锚点/自由点决定，连线始终为两点间的直线。
  routerRegistry.register(
    STRAIGHT_ROUTER_NAME,
    (vertices: any[]) => vertices,
    true,
  );

  // 纯直线路由器：与 straight 相同（返回原始顶点），但语义上表示
  // 端点不绑定任何节点/锚点，始终为自由点。
  routerRegistry.register(
    LINE_ROUTER_NAME,
    (vertices: any[]) => vertices,
    true,
  );

  registered = true;
}
