import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import * as math from './math.js'
import { computeIK } from './control.js'

const linkArmLength = 175 // mm
const angleLinkLength = 185 // mm
const receiverWidth = 145.5 // mm
const upperLinkOffset = 6 // mm
const pitchBearingDist = 75 // Distance between pitcher hole and arm hole on the receiver

const scale = 0.5 // 180 degrees rotation

/*
const armX = 58.5
const armZ = 59.92 - 10 // Servo axle is about 10mm from the edge of the servo.
const pitcherArmX = 14.318
const pitcherArmYZ = [-29.72, 49.325]
*/

const upLeft = new THREE.Vector3(1, 0, 0)
const upRotation = new THREE.Vector3(0, 1, 0)
const receiverDirection = new THREE.Vector3(-1, 0, 0)
const pitcherBearingVector = new THREE.Vector3(0, -pitchBearingDist, 0)

const loader = new GLTFLoader()

const names = new Map([
  ['SR6_Receiver_Beta1', 'receiver'],
  ['Pitcher_L', 'leftPitcher'],
  ['Pitcher_R', 'rightPitcher'],
  ['Arm_UL', 'upperLeftArm'],
  ['Arm_UR', 'upperRightArm'],
  ['Arm_LL', 'lowerLeftArm'],
  ['Arm_LR', 'lowerRightArm'],
  ['Link_UL', 'upperLeftLink'],
  ['Link_UR', 'upperRightLink'],
  ['Link_LL', 'lowerLeftLink'],
  ['Link_LR', 'lowerRightLink'],
  ['PitcherLink_L', 'leftPitcherLink'],
  ['PitcherLink_R', 'rightPitcherLink'],
])

export async function load() {
  const gltf = await loader.loadAsync('/osr.gltf')
  const group = gltf.scene.children[0]
  console.log(group)

  const objects = {}
  group.traverse((g) => {
    const n = names.get(g.name)
    if (!n) return
    objects[n] = g
  })

  objects.leftPitcherLink.up.set(0, 0, 1)
  objects.rightPitcherLink.up.set(0, 0, 1)

  return { group, objects }
}

export function move(m) {
  const ik = computeIK()
  const lowerLeftServoAngle = servoToRotation(ik.lowerLeft, scale) - Math.PI
  const upperLeftServoAngle = servoToRotation(ik.upperLeft, scale)
  const lowerRightServoAngle = servoToRotation(ik.lowerRight, -scale) - Math.PI
  const upperRightServoAngle = servoToRotation(ik.upperRight, -scale)
  const leftPitchServoAngle = servoToRotation(ik.leftPitch, -scale)
  const rightPitchServoAngle = servoToRotation(ik.rightPitch, scale)

  m.leftPitcher.rotation.x = leftPitchServoAngle
  m.rightPitcher.rotation.x = rightPitchServoAngle
  m.lowerLeftArm.rotation.x = lowerLeftServoAngle + Math.PI
  m.upperLeftArm.rotation.x = upperLeftServoAngle + Math.PI
  m.lowerRightArm.rotation.x = lowerRightServoAngle
  m.upperRightArm.rotation.x = upperRightServoAngle

  m.lowerLeftLink.position.copy(linkPos(m.lowerLeftArm, lowerLeftServoAngle))
  m.upperLeftLink.position.copy(linkPos(m.upperLeftArm, upperLeftServoAngle))
  m.lowerRightLink.position.copy(linkPos(m.lowerRightArm, lowerRightServoAngle, -1))
  m.upperRightLink.position.copy(linkPos(m.upperRightArm, upperRightServoAngle, -1))

  const leftX = mainLinkIntersection(m.upperLeftLink, m.lowerLeftLink)
  const rightX = mainLinkIntersection(m.upperRightLink, m.lowerRightLink)
  if (!leftX || !rightX) {
    console.warn('No valid intersection found for link arms!')
    return
  }

  const actualWidth = rightX.p.clone().sub(leftX.p).length()
  if (actualWidth > receiverWidth) {
    // Keep the main arms attached to the receiver by applying an offset
    // when the distance between the attachment points is too large.
    const offset = (actualWidth - receiverWidth) / 2
    const lc = leftX.p.clone()
    const rc = rightX.p.clone()
    leftX.p.addScaledVector(rc.clone().sub(lc).normalize(), offset)
    rightX.p.addScaledVector(lc.clone().sub(rc).normalize(), offset)
  }

  if (ik.swayArc) {
    // To apply sway, we rotate the main arms around the Y axis (relative to their center points)
    leftX.p
      .sub(leftX.c)
      .applyAxisAngle(upRotation, ik.swayArc / leftX.r)
      .add(leftX.c)
    rightX.p
      .sub(rightX.c)
      .applyAxisAngle(upRotation, ik.swayArc / rightX.r)
      .add(rightX.c)
  }

  m.lowerLeftLink.lookAt(toWorldCoords(leftX.p))
  m.lowerRightLink.lookAt(toWorldCoords(rightX.p))

  // The upper links of the main arms are attached on the outside, so we shift them over by an offset.
  const leftSh = leftX.p.clone().addScaledVector(leftX.p.clone().sub(rightX.p).normalize(), upperLinkOffset)
  const rightSh = rightX.p.clone().addScaledVector(rightX.p.clone().sub(leftX.p).normalize(), upperLinkOffset)

  m.upperLeftLink.lookAt(toWorldCoords(leftSh))
  m.upperRightLink.lookAt(toWorldCoords(rightSh))

  const pitchQuaternion = new THREE.Quaternion().setFromAxisAngle(upLeft, ik.pitchAngle)
  const pitchBearingAngle = ik.pitchAngle - 0.2576665 // Angle to the pitch holes on the receiver (from main arm holes) 14.76deg
  const pitchBearingQuaternion = new THREE.Quaternion().setFromAxisAngle(upLeft, pitchBearingAngle)

  const receiverMainBearingAxis = rightX.p.clone().sub(leftX.p).normalize()
  const rotationAxis = receiverDirection.clone().cross(receiverMainBearingAxis).normalize()
  const rotationAngle = Math.acos(-upLeft.dot(receiverMainBearingAxis))
  const rollQuaternion = new THREE.Quaternion().setFromAxisAngle(rotationAxis, rotationAngle)

  const receiverQuaternion = rollQuaternion.clone().multiply(pitchQuaternion)
  m.receiver.position.copy(leftX.p.clone().lerp(rightX.p, 0.5))
  m.receiver.setRotationFromQuaternion(receiverQuaternion)

  const leftPitcherBearingPos = new THREE.Vector3(0, -55, 0)
    .applyQuaternion(rollQuaternion.clone().multiply(pitchBearingQuaternion))
    .add(leftX.p)

  const rightPitcherBearingPos = leftPitcherBearingPos.clone().add(rightX.p.clone().sub(leftX.p))

  pitcherIntersection(m.leftPitcher, leftPitcherBearingPos, m.leftPitcherLink, leftPitchServoAngle)
  pitcherIntersection(m.rightPitcher, rightPitcherBearingPos, m.rightPitcherLink, rightPitchServoAngle)
}

function toWorldCoords(vec) {
  return vec.clone().applyAxisAngle(upLeft, -Math.PI / 2)
}

function linkPos(arm, angle, scale = 1) {
  return new THREE.Vector3(0, -50, 0)
    .applyAxisAngle(upLeft, angle)
    .add(arm.position)
    .addScaledVector(upLeft, scale * 14.5)
}

function mainLinkIntersection(upLink, loLink) {
  const upLinkPos = upLink.position
  const loLinkPos = loLink.position
  const hit = math.circleCircleIntersection(upLinkPos, linkArmLength, loLinkPos, linkArmLength)
  if (!hit || hit.radius === 0) return null

  const tangentVector = upLinkPos.clone().sub(loLinkPos).cross(upLeft).normalize()
  return {
    p: hit.center.clone().add(tangentVector.clone().multiplyScalar(hit.radius)),
    c: hit.center,
    r: hit.radius,
  }
}

function pitcherIntersection(pitcher, endBearingPos, link, angle) {
  link.lookAt(toWorldCoords(endBearingPos))

  const pts = math.circleSphereIntersection(pitcher.position, pitchBearingDist, upLeft, endBearingPos, angleLinkLength)
  if (!pts) return
  const pos = pts.length === 1 ? pts[0] : pts[0].y < pts[1].y ? pts[0] : pts[1]
  link.position.copy(pos)

  // Correct servo angle using inverse kinematics.
  const target = link.position.clone().sub(pitcher.position)
  const current = pitcherBearingVector.clone().applyAxisAngle(upLeft, angle)
  const correction = target.angleTo(current)
  const direction = math.vectorDirection(target, current, upLeft)
  pitcher.rotation.x -= correction * direction
}

/** @param {number} servoValue */
function servoToRotation(servoValue, scale = 1) {
  // Map the servo value to an angle in radians.
  return math.mapDecimal(servoValue, 0, 65535, math.pi(-scale), math.pi(scale))
}
