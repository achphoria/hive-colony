// Gabungkan mesh statis di dalamnya menjadi satu mesh per material (+ status bayangan).
// Ratusan furnitur kecil jadi beberapa draw call saja, jadi koloni jauh lebih ringan.
// Bagian yang beranimasi diberi userData={{ dynamic: true }} dan dilewati beserta isinya.
import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const ATTRS = ['position', 'normal', 'uv'];

export function StaticMerge({ children, ...props }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    root.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const buckets = new Map();

    const visit = (o) => {
      if (o.userData?.dynamic) return;
      const ok =
        o.isMesh &&
        !o.isInstancedMesh &&
        !o.isSkinnedMesh &&
        o.visible &&
        o.children.length === 0 &&
        !Array.isArray(o.material) &&
        o.geometry?.index &&
        ATTRS.every((a) => o.geometry.attributes[a]);
      if (ok) {
        const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}`;
        if (!buckets.has(key)) buckets.set(key, { material: o.material, cast: o.castShadow, receive: o.receiveShadow, items: [] });
        buckets.get(key).items.push(o);
        return;
      }
      o.children.forEach(visit);
    };
    root.children.forEach(visit);

    const merged = [];
    const hidden = [];
    for (const b of buckets.values()) {
      if (b.items.length < 2) continue;
      const geos = b.items.map((o) => {
        const g = new THREE.BufferGeometry();
        ATTRS.forEach((a) => g.setAttribute(a, o.geometry.attributes[a].clone()));
        g.setIndex(o.geometry.index.clone());
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
        return g;
      });
      const geo = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, b.material);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.receive;
      mesh.userData.merged = true;
      root.add(mesh);
      merged.push(mesh);
      b.items.forEach((o) => {
        o.visible = false;
        hidden.push(o);
      });
    }

    return () => {
      merged.forEach((m) => {
        root.remove(m);
        m.geometry.dispose();
      });
      hidden.forEach((o) => (o.visible = true));
    };
  }, []);

  return (
    <group ref={ref} {...props}>
      {children}
    </group>
  );
}
