"use client";

/*
 * The floor.
 *
 * A real WebGL scene (react-three-fiber), not CSS pretending to be one: each
 * person is a card in 3D space on a shallow arc, so the grid has genuine depth
 * and parallax as the camera drifts. The camera is on a gentle idle orbit and
 * eases toward whoever is focused.
 *
 * Three rules this file keeps:
 *
 *   1. NOTHING here reads the DOM theme directly — colours are passed in as
 *      resolved rgb strings by the parent, which reads the CSS variables once.
 *      A canvas cannot inherit a custom property.
 *   2. The whole canvas is aria-hidden and purely presentational. Every fact it
 *      draws is also in the accessible list beside it, so a screen reader and a
 *      keyboard user never depend on WebGL.
 *   3. Reduced motion stops the idle drift and the entrance float. The scene
 *      still renders; it just holds still.
 */

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Billboard, RoundedBox, Text } from "@react-three/drei";
import * as THREE from "three";

export type ScenePerson = {
  id: string;
  name: string;
  initials: string;
  role: string;
  kra: number;
  /** Resolved `rgb(...)` string — see rule 1 above. */
  colour: string;
  /** Label colour that is legible on `colour`. */
  onColour: string;
  busy: boolean;
};

/** Columns grow with the roster so 6 people are not spread across a wall. */
function columnsFor(count: number) {
  if (count <= 4) return count || 1;
  if (count <= 9) return 3;
  if (count <= 16) return 4;
  if (count <= 30) return 5;
  return 6;
}

const CARD_W = 1.55;
const CARD_H = 1.05;
const GAP_X = 1.85;
const GAP_Y = 1.45;
/** How far the arc bends back at the edges. */
const ARC = 0.085;

function layout(count: number) {
  const cols = columnsFor(count);
  const rows = Math.ceil(count / cols);
  return Array.from({ length: count }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = (col - (cols - 1) / 2) * GAP_X;
    const y = ((rows - 1) / 2 - row) * GAP_Y;
    // Bend the outer columns away from the camera — a shallow video-wall arc.
    const z = -(x * x) * ARC;
    return { x, y, z, yaw: -x * ARC * 0.9 };
  });
}

function PersonCard({
  person,
  position,
  yaw,
  index,
  focused,
  dimmed,
  reduced,
  onFocus,
}: {
  person: ScenePerson;
  position: [number, number, number];
  yaw: number;
  index: number;
  focused: boolean;
  dimmed: boolean;
  reduced: boolean;
  onFocus: (id: string | null) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;

    // Idle bob, phase-shifted per card so the wall breathes instead of pulsing.
    const bob = reduced ? 0 : Math.sin(t * 0.7 + index * 0.6) * 0.045;
    const lift = focused || hovered ? 0.22 : 0;

    g.position.y += (position[1] + bob + lift - g.position.y) * 0.12;
    g.position.z += (position[2] + (focused || hovered ? 0.5 : 0) - g.position.z) * 0.12;

    const targetScale = focused ? 1.18 : hovered ? 1.08 : 1;
    const s = g.scale.x + (targetScale - g.scale.x) * 0.15;
    g.scale.setScalar(s);

    g.rotation.y += (yaw + (hovered ? 0.06 : 0) - g.rotation.y) * 0.12;
  });

  const opacity = dimmed ? 0.22 : 1;
  // KRA drives the meter width; it is a 0-100 scale.
  const kraWidth = Math.max(0.02, (Math.min(Math.max(person.kra, 0), 100) / 100) * (CARD_W - 0.3));

  return (
    <group
      ref={group}
      position={[position[0], position[1], position[2]]}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "";
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onFocus(focused ? null : person.id);
      }}
    >
      {/* the tile */}
      <RoundedBox args={[CARD_W, CARD_H, 0.06]} radius={0.06} smoothness={4}>
        <meshStandardMaterial
          color={person.colour}
          transparent
          opacity={opacity}
          roughness={0.45}
          metalness={0.08}
          emissive={person.colour}
          emissiveIntensity={focused ? 0.35 : hovered ? 0.2 : 0.06}
        />
      </RoundedBox>

      {/* initials, large, like a muted video tile */}
      <Billboard position={[0, 0.17, 0.05]}>
        <Text
          fontSize={0.3}
          color={person.onColour}
          anchorX="center"
          anchorY="middle"
          fillOpacity={opacity}
        >
          {person.initials}
        </Text>
      </Billboard>

      {/* name + role */}
      <Text
        position={[0, -0.16, 0.05]}
        fontSize={0.105}
        color={person.onColour}
        anchorX="center"
        anchorY="middle"
        maxWidth={CARD_W - 0.2}
        fillOpacity={opacity}
      >
        {person.name}
      </Text>
      <Text
        position={[0, -0.3, 0.05]}
        fontSize={0.072}
        color={person.onColour}
        anchorX="center"
        anchorY="middle"
        maxWidth={CARD_W - 0.2}
        fillOpacity={opacity * 0.75}
      >
        {person.role}
      </Text>

      {/* KRA meter along the bottom edge */}
      <mesh position={[0, -0.43, 0.05]}>
        <planeGeometry args={[CARD_W - 0.3, 0.035]} />
        <meshBasicMaterial color={person.onColour} transparent opacity={opacity * 0.22} />
      </mesh>
      <mesh position={[-(CARD_W - 0.3) / 2 + kraWidth / 2, -0.43, 0.055]}>
        <planeGeometry args={[kraWidth, 0.035]} />
        <meshBasicMaterial color={person.onColour} transparent opacity={opacity * 0.9} />
      </mesh>

      {/* "on work right now" pip */}
      {person.busy && (
        <mesh position={[CARD_W / 2 - 0.13, CARD_H / 2 - 0.13, 0.06]}>
          <circleGeometry args={[0.045, 24]} />
          <meshBasicMaterial color={person.onColour} transparent opacity={opacity} />
        </mesh>
      )}
    </group>
  );
}

/** Camera drift + ease-to-focus. Lives inside the Canvas so it can use frames. */
function Rig({
  focusAt,
  reduced,
}: {
  focusAt: [number, number, number] | null;
  reduced: boolean;
}) {
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const drift = reduced ? 0 : 1;
    const base = focusAt
      ? new THREE.Vector3(focusAt[0] * 0.55, focusAt[1] * 0.55, 5.4)
      : new THREE.Vector3(Math.sin(t * 0.14) * 0.65 * drift, Math.sin(t * 0.1) * 0.3 * drift, 7.2);

    state.camera.position.lerp(base, 0.035);
    target.lerp(
      new THREE.Vector3(focusAt ? focusAt[0] * 0.4 : 0, focusAt ? focusAt[1] * 0.4 : 0, 0),
      0.05,
    );
    state.camera.lookAt(target);
  });
  return null;
}

export default function Scene({
  people,
  focusedId,
  onFocus,
  reduced,
}: {
  people: ScenePerson[];
  focusedId: string | null;
  onFocus: (id: string | null) => void;
  reduced: boolean;
}) {
  const slots = useMemo(() => layout(people.length), [people.length]);
  const focusIndex = people.findIndex((p) => p.id === focusedId);
  const focusAt: [number, number, number] | null =
    focusIndex >= 0 && slots[focusIndex]
      ? [slots[focusIndex].x, slots[focusIndex].y, slots[focusIndex].z]
      : null;

  return (
    <Canvas
      aria-hidden
      dpr={[1, 2]}
      camera={{ position: [0, 0, 7.2], fov: 42 }}
      // Clicking the empty floor clears the focus, the same as Escape does.
      onPointerMissed={() => onFocus(null)}
      style={{ touchAction: "pan-y" }}
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 4, 6]} intensity={1.1} />
      <directionalLight position={[-4, -2, 3]} intensity={0.35} />

      <Rig focusAt={focusAt} reduced={reduced} />

      {people.map((person, i) => {
        const slot = slots[i];
        return (
          <PersonCard
            key={person.id}
            person={person}
            index={i}
            position={[slot.x, slot.y, slot.z]}
            yaw={slot.yaw}
            focused={person.id === focusedId}
            dimmed={focusedId !== null && person.id !== focusedId}
            reduced={reduced}
            onFocus={onFocus}
          />
        );
      })}
    </Canvas>
  );
}
