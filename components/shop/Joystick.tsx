"use client";

import { useRef, useState, type RefObject } from "react";
import type { Rig } from "./rig";
import styles from "./Shop.module.css";

const RADIUS = 44;

/** An on-screen thumbstick for walking on a touch screen. */
export function Joystick({ rigRef, raised = false }: { rigRef: RefObject<Rig>; raised?: boolean }) {
  const base = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const move = (clientX: number, clientY: number) => {
    const rect = base.current?.getBoundingClientRect();
    if (!rect) return;
    let dx = clientX - (rect.left + rect.width / 2);
    let dy = clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy);
    if (length > RADIUS) {
      dx = (dx / length) * RADIUS;
      dy = (dy / length) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    rigRef.current.input.stickX = dx / RADIUS;
    rigRef.current.input.stickY = dy / RADIUS;
  };

  const release = () => {
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    rigRef.current.input.stickX = 0;
    rigRef.current.input.stickY = 0;
  };

  return (
    <div
      ref={base}
      className={styles.stick}
      data-raised={raised}
      aria-hidden="true"
      onPointerDown={(event) => {
        event.stopPropagation();
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        move(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        event.stopPropagation();
        if (pointer.current === event.pointerId) move(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        release();
      }}
      onPointerCancel={release}
    >
      <div
        className={styles.knob}
        style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
      />
    </div>
  );
}
