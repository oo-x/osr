/**
 * @typedef {import('three').Vector3} Vector3
 */

export function pi(n = 1) {
	return Math.PI * n
}

/**
 * @param {number} x
 * @param {number} a
 * @param {number} b
 */
export function constrain(x, a, b) {
  return Math.max(a, Math.min(x, b))
}

/**
 * @param {number} x
 * @param {number} in_min
 * @param {number} in_max
 * @param {number} out_min
 * @param {number} out_max
 */
export function map(x, in_min, in_max, out_min, out_max) {
  return Math.floor(((x - in_min) * (out_max - out_min)) / (in_max - in_min) + out_min)
}

/**
 * @param {number} value
 * @param {number} inMin
 * @param {number} inMax
 */
export function mapDecimal(value, inMin, inMax, outMin = 0, outMax = 1) {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin
}

/**
 * Calculate the intersection point(s) of a circle and a sphere.
 *
 * Uses the algorithm described here:
 * https://gamedev.stackexchange.com/questions/75756/sphere-sphere-intersection-and-circle-sphere-intersection
 *
 * @param {Vector3} circleCenter
 * @param {number} circleRadius
 * @param {Vector3} circlePlaneDirection
 * @param {Vector3} sphereCenter
 * @param {number} sphereRadius
 */
export function circleSphereIntersection(circleCenter, circleRadius, circlePlaneDirection, sphereCenter, sphereRadius) {
  const circlePlaneNormal = circlePlaneDirection.clone().normalize()

  // The plane of the circle cuts the sphere this distance from the sphere's center.
  const distanceToPlane = circlePlaneNormal.dot(circleCenter.clone().sub(sphereCenter))

  // There is no intersection.
  if (Math.abs(distanceToPlane) > sphereRadius) return null

  // The center of the circle cut out of the sphere by the plane.
  const sphereCircleCenter = circlePlaneNormal.clone().multiplyScalar(distanceToPlane).add(sphereCenter)

  if (Math.abs(distanceToPlane) === sphereRadius) {
    // This is the sole intersection point with the plane.
    // If it lies on the circle its the intersection point.
    if (sphereCircleCenter.distanceTo(circleCenter) === circleRadius) return [sphereCircleCenter]

    // Does not intersect.
    return null
  }

  const sphereCircleRadius = Math.sqrt(sphereRadius * sphereRadius - distanceToPlane * distanceToPlane)
  const intersectionCircle = circleCircleIntersection(
    sphereCircleCenter,
    sphereCircleRadius,
    circleCenter,
    circleRadius
  )

  if (!intersectionCircle) return null

  const { center, radius } = intersectionCircle

  // Single point of intersection
  if (radius === 0) return [center]

  const tangentVector = sphereCircleCenter.clone().sub(circleCenter).cross(circlePlaneNormal).normalize()

  return [
    center.clone().sub(tangentVector.clone().multiplyScalar(radius)),
    center.clone().add(tangentVector.clone().multiplyScalar(radius)),
  ]
}

/**
 * Compute the intersection between two circles. Returns an object with { center, radius }.
 * If there is only one intersection point, the radius will be zero.
 *
 * https://gamedev.stackexchange.com/questions/75756/sphere-sphere-intersection-and-circle-sphere-intersection
 *
 * @param {Vector3} c1
 * @param {number} r1
 * @param {Vector3} c2
 * @param {number} r2
 */
export function circleCircleIntersection(c1, r1, c2, r2) {
  const difference = c2.clone().sub(c1)
  const distance = Math.abs(difference.length())

  if (distance === 0 || r1 + r2 < distance || distance + Math.min(r1, r2) < Math.max(r1, r2)) {
    // Infinitely many intersections or none.
    return null
  }

  if (r1 + r2 === distance) {
    // Exactly one intersection
    return {
      radius: 0,
      center: c1
        .clone()
        .add(difference)
        .multiplyScalar(r1 / distance),
    }
  }

  if (distance + Math.min(r1, r2) === Math.max(r1, r2)) {
    // Exactly one intersection, but one circle is inside the other.
    const largerCircle = r1 > r2 ? c1.clone() : c2.clone()
    const smallerCircle = r1 < r2 ? c1.clone() : c2.clone()
    const largerRadius = Math.max(r1, r2)

    return {
      radius: 0,
      center: largerCircle.add(smallerCircle.sub(largerCircle).multiplyScalar(largerRadius / distance)),
    }
  }

  const h = 0.5 + (r1 * r1 - r2 * r2) / (2 * distance * distance)
  const center = c1.clone().add(difference.multiplyScalar(h))
  const radius = Math.sqrt(r1 * r1 - h * h * distance * distance)

  return { center, radius }
}

/**
 * Returns the "direction" of a vector with respect to another using an up vector.
 *
 * Inspired by https://forum.unity.com/threads/left-right-test-function.31420/
 *
 * @param {THREE.Vector3} a
 * @param {THREE.Vector3} b
 * @param {THREE.Vector3} up
 */
export function vectorDirection(a, b, up) {
  const right = up.clone().cross(a)
  const dir = right.dot(b)

  return dir > 0 ? 1 : dir < 0 ? -1 : 0
}
