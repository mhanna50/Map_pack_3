"use client";

import { motion } from "framer-motion";

type Node = {
  id: string;
  label: string;
  x: number;
  y: number;
};

type Connection = {
  from: string;
  to: string;
};

const NODE_WIDTH = 190;
const NODE_HEIGHT = 68;

// Top-to-bottom layout with increased spacing
const nodes: Node[] = [
  { id: "1", label: "Your Google Business Profile", x: 540, y: 80 },

  { id: "2", label: "Review Automation", x: 320, y: 232 },
  { id: "5", label: "Automated Posting", x: 760, y: 232 },

  { id: "3", label: "More 5 Star Reviews", x: 320, y: 382 },
  { id: "6", label: "Consistent Profile Activity", x: 760, y: 382 },

  { id: "4", label: "Stronger Reputation", x: 320, y: 532 },
  { id: "7", label: "Higher Local Visibility", x: 760, y: 532 },

  { id: "8", label: "More Profile Interactions", x: 540, y: 682 },
];

const connections: Connection[] = [
  { from: "1", to: "2" },
  { from: "2", to: "3" },
  { from: "3", to: "4" },
  { from: "4", to: "8" },
  { from: "1", to: "5" },
  { from: "5", to: "6" },
  { from: "6", to: "7" },
  { from: "7", to: "8" },
];

const primaryColor = "#38bdf8"; // sky-400
const fillColor = "rgba(56, 189, 248, 0.25)";

const getNodePosition = (id: string) => {
  const node = nodes.find((n) => n.id === id);
  return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
};

const getConnectionPath = (from: string, to: string) => {
  const fromPos = getNodePosition(from);
  const toPos = getNodePosition(to);

  const startX = fromPos.x;
  const startY = fromPos.y + NODE_HEIGHT / 2;
  const endX = toPos.x;
  const endY = toPos.y - NODE_HEIGHT / 2;

  const midY = (startY + endY) / 2;

  return `M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`;
};

const getNodeBorderPath = (x: number, y: number, width: number, height: number, radius: number) => {
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  return [
    // start at top-left corner after radius
    `M ${x - halfWidth + radius} ${y - halfHeight}`,
    `L ${x + halfWidth - radius} ${y - halfHeight}`,
    `A ${radius} ${radius} 0 0 1 ${x + halfWidth} ${y - halfHeight + radius}`,
    `L ${x + halfWidth} ${y + halfHeight - radius}`,
    `A ${radius} ${radius} 0 0 1 ${x + halfWidth - radius} ${y + halfHeight}`,
    `L ${x - halfWidth + radius} ${y + halfHeight}`,
    `A ${radius} ${radius} 0 0 1 ${x - halfWidth} ${y + halfHeight - radius}`,
    `L ${x - halfWidth} ${y - halfHeight + radius}`,
    `A ${radius} ${radius} 0 0 1 ${x - halfWidth + radius} ${y - halfHeight}`,
    "Z",
  ].join(" ");
};

const getAnimationOrder = (nodeId: string) => {
  const orders: Record<string, number> = {
    "1": 0,
    "2": 1,
    "5": 1,
    "3": 2,
    "6": 2,
    "4": 3,
    "7": 3,
    "8": 4,
  };

  return orders[nodeId] ?? 0;
};

const SPEED = 1.5; // 50% slower
const NODE_DELAY_STEP = 0.45 * SPEED;
const NODE_DURATION = 0.6 * SPEED;

const CONN_DELAY_BASE = 0.15 * SPEED;
const CONN_DELAY_STEP = 0.45 * SPEED;
const CONN_DURATION = 0.8 * SPEED;

const BORDER_DELAY_BASE = 0.35 * SPEED;
const BORDER_DELAY_STEP = 0.45 * SPEED;
const BORDER_DURATION = 0.7 * SPEED;

const connectionDelay = (order: number) => CONN_DELAY_BASE + order * CONN_DELAY_STEP;

const nodeVariants = {
  hidden: { scale: 0.7, opacity: 0 },
  visible: (custom: number) => ({
    scale: 1,
    opacity: 1,
    transition: {
      delay: custom * NODE_DELAY_STEP,
      duration: NODE_DURATION,
      ease: "easeOut",
    },
  }),
};

const connectionVariants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: (custom: number) => ({
    pathLength: 1,
    opacity: 1,
    transition: {
      delay: connectionDelay(custom),
      duration: CONN_DURATION,
      ease: "easeInOut",
    },
  }),
};

const borderVariants = {
  hidden: { pathLength: 0 },
  visible: (custom: number) => ({
    pathLength: 1,
    transition: {
      delay: BORDER_DELAY_BASE + custom * BORDER_DELAY_STEP,
      duration: BORDER_DURATION,
      ease: "easeOut",
    },
  }),
};

export function FlowChart() {
  return (
    <div className="relative w-full overflow-visible">
      <div className="relative mx-auto max-w-[1100px] overflow-x-auto px-2">
        <div className="min-w-[900px]">
          <div className="relative mx-auto h-[860px] w-[1100px]">
            <svg viewBox="0 0 1100 900" className="absolute inset-0 h-full w-full" role="presentation">
              {connections.map((connection) => {
                const animationOrder = getAnimationOrder(connection.to);

                return (
                  <g key={`${connection.from}-${connection.to}`} className="mix-blend-screen">
                    <path
                      d={getConnectionPath(connection.from, connection.to)}
                      fill="none"
                      stroke="rgba(148, 163, 184, 0.6)"
                      strokeWidth={3}
                      strokeLinecap="round"
                    />

                    <motion.path
                      d={getConnectionPath(connection.from, connection.to)}
                      fill="none"
                      stroke={primaryColor}
                      strokeWidth={3}
                      variants={connectionVariants}
                      initial="hidden"
                      animate="visible"
                      custom={animationOrder}
                      strokeLinecap="round"
                    />

                    <motion.circle
                      cx={getNodePosition(connection.to).x}
                      cy={getNodePosition(connection.to).y - NODE_HEIGHT / 2}
                      r={4}
                      fill={primaryColor}
                      variants={connectionVariants}
                      initial="hidden"
                      animate="visible"
                      custom={animationOrder}
                    />
                  </g>
                );
              })}

              {nodes.map((node) => {
                const animationOrder = getAnimationOrder(node.id);

                return (
                  <motion.path
                    key={`border-${node.id}`}
                    d={getNodeBorderPath(node.x, node.y, NODE_WIDTH, NODE_HEIGHT, 14)}
                    fill="none"
                    stroke={primaryColor}
                    strokeWidth={8}
                    variants={borderVariants}
                    initial="hidden"
                    animate="visible"
                    custom={animationOrder}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })}
            </svg>

            {nodes.map((node) => {
              const animationOrder = getAnimationOrder(node.id);

              return (
                <motion.div
                  key={node.id}
                  className="absolute grid place-items-center overflow-hidden text-white"
                  style={{
                    left: node.x - NODE_WIDTH / 2,
                    top: node.y - NODE_HEIGHT / 2,
                    width: NODE_WIDTH,
                    height: NODE_HEIGHT,
                  }}
                  initial="hidden"
                  animate="visible"
                  variants={nodeVariants}
                  custom={animationOrder}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                >
                  <motion.div
                    className="absolute inset-0 rounded-[14px]"
                    style={{ background: fillColor }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                      delay: connectionDelay(animationOrder) + CONN_DURATION,
                      duration: 0.6 * SPEED,
                      ease: "easeOut",
                    }}
                  />
                  <motion.span
                    className="relative z-10 px-3 text-center text-xs font-semibold leading-tight break-words"
                    style={{
                      maxWidth: "100%",
                      transform: node.id === "1" ? undefined : "translate(4px, -4px)",
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: connectionDelay(animationOrder) + CONN_DURATION }}
                  >
                    {node.label}
                  </motion.span>
                </motion.div>
              );
            })}

          </div>
        </div>
      </div>
    </div>
  );
}
