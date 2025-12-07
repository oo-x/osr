import * as math from './math.js'

const swayRange = 30 // mm
const pitchRange = 50 // mm

const msPerRad = 637
const servoFrequency = 330
const servoInterval = 1000000 / servoFrequency

const servoZero = 1515.105
const pitchServoZero = 1580
const rightPitchServoZero = 2 * servoZero - pitchServoZero

const COMMAND_REGEX = /^([LR][012])([0-9]+)(?:([IS])([0-9]+))?$/

const axisNames = [
  'L0', // Stroke
  'L1', // Forward
  'L2', // Left
  'R0', // Twist
  'R1', // Roll
  'R2', // Pitch
]

const MIN_SMOOTH_INTERVAL = 3 // Minimum auto-smooth ramp interval for live commands (ms)
const MAX_SMOOTH_INTERVAL = 100 // Maximum auto-smooth ramp interval for live commands (ms)

/** A class that emulates the behavior of an axis as coded on the OSR Firmware (v3.3) */
class Axis {
  name = ''

  #startTime = 0
  #startPosition = 5000
  #targetTime = 0
  #targetPosition = 5000
  #minInterval = MAX_SMOOTH_INTERVAL

  constructor(name) {
    this.name = name
  }

  set(magnitude, ext, extMagnitude) {
    const currentTime = performance.now()
    magnitude = math.constrain(magnitude, 0, 9999)
    extMagnitude = math.constrain(extMagnitude, 0, 9999999)

    if (!extMagnitude || (ext !== 'S' && ext !== 'I')) {
      const lastInterval = currentTime - this.#startTime
      if (lastInterval > this.#minInterval && this.#minInterval < MAX_SMOOTH_INTERVAL) {
        this.#minInterval += 1
      } else if (lastInterval < this.#minInterval && this.#minInterval > MIN_SMOOTH_INTERVAL) {
        this.#minInterval -= 1
      }

      this.#startPosition = this.getPosition()
      this.#targetTime = currentTime + this.#minInterval
    } else if (ext === 'S') {
      const speed = extMagnitude / 100 // Interpret extMagntitude as units per 100 ms.
      this.#startPosition = this.getPosition()

      let distance = Math.abs(magnitude - this.#startPosition)
      let duration = Math.floor(distance / speed)
      this.#targetTime = currentTime + duration
    } else if (ext == 'I') {
      const duration = extMagnitude // Interpret extMagnitude as the duration of the move in ms.
      this.#startPosition = this.getPosition()
      this.#targetTime = currentTime + duration
    }

    this.#startTime = currentTime
    this.#targetPosition = magnitude
  }

  getPosition() {
    let position // 0 - 9999
    const currentTime = performance.now()

    if (currentTime > this.#targetTime) {
      position = this.#targetPosition
    } else if (currentTime > this.#startTime) {
      position = math.map(currentTime, this.#startTime, this.#targetTime, this.#startPosition, this.#targetPosition)
    } else {
      position = this.#startPosition
    }

    return math.constrain(position, 0, 9999)
  }
}

export const axisEmulator = Object.fromEntries(axisNames.map((n) => [n, new Axis(n)]))

let buffer = ''

/** @param {string} input */
export function write(input) {
  for (let byte of input) {
    buffer += byte
    if (byte === '\n') {
      const commands = buffer.trim().split(/\s/)
      for (const command of commands) {
        const m = COMMAND_REGEX.exec(command.trim())
        if (!m) continue
        const val = Number(m[2].substring(0, 4).padEnd(4, '0'))
        axisEmulator[m[1]].set(val, m[3], Number(m[4]))
      }
      buffer = ''
    }
  }
}

export function getAxes() {
  return Object.fromEntries(Object.entries(axisEmulator).map(([n, a]) => [n, a.getPosition() / 10000]))
}

export function computeIK() {
  const axes = Object.fromEntries(Object.entries(axisEmulator).map(([n, a]) => [n, a.getPosition() / 10000]))

  const R1 = math.mapDecimal(axes.R1, 0, 0.9999, -3000, 3000) // roll
  const R2 = math.mapDecimal(axes.R2, 0, 0.9999, -2500, 2500) // pitch
  const L0 = math.mapDecimal(axes.L0, 0, 0.9999, -6000, 6000) // thrust 120 mm stroke length
  const L1 = 16248 - math.mapDecimal(axes.L1, 0, 0.9999, -3000, 3000) // fwd 60 mm
  const L2 = math.mapDecimal(axes.L2, 0, 0.9999, -3000, 3000) // side 60 mm

  const out1 = mainServo(L1, 1500 + L0 + R1) // Lower left servo
  const out2 = mainServo(L1, 1500 - L0 - R1) // Upper left servo
  const out5 = mainServo(L1, 1500 - L0 + R1) // Upper right servo
  const out6 = mainServo(L1, 1500 + L0 - R1) // Lower right servo
  const out3 = pitchServo(L1, 4500 - L0, L2 - 1.5 * R1, -R2)
  const out4 = pitchServo(L1, 4500 - L0, -L2 + 1.5 * R1, -R2)

  const fout3 = math.constrain(pitchServoZero - out3, pitchServoZero - 600, pitchServoZero + 1000)
  const fout4 = math.constrain(rightPitchServoZero + out4, rightPitchServoZero - 1000, rightPitchServoZero + 600)

  return {
    twist: axes.R0 * math.pi(4 / 3) - math.pi(2 / 3),
    lowerLeft: getServo(servoZero - out1),
    upperLeft: getServo(servoZero + out2),
    leftPitch: getServo(fout3),
    rightPitch: getServo(fout4),
    upperRight: getServo(servoZero - out5),
    lowerRight: getServo(servoZero + out6),

		// helpers
		swayArc: swayRange * ((axes.L2 - 0.5) / 0.5),
    pitchAngle: axes.R2 * math.pi(pitchRange / 180) - math.pi(pitchRange / 360),
  }
}

/** @param {number} val */
function getServo(val) {
  return math.mapDecimal(val, 0, servoInterval, 0, 65535)
}

/**
 * @param {number} x
 * @param {number} y
 */
function mainServo(x, y) {
  // Function to calculate the angle for the main arm servos
  // Inputs are target x,y coords of receiver pivot in 1/100 of a mm
  x /= 100
  y /= 100 // Convert to mm
  const gamma = Math.atan2(x, y) // Angle of line from servo pivot to receiver pivot
  const csq = x * x + y * y // Square of distance between servo pivot and receiver pivot
  const c = Math.sqrt(csq) // Distance between servo pivot and receiver pivot

  let betaCos = (csq - 28125) / (100 * c)
  betaCos = betaCos < -1 ? -1 : betaCos > 1 ? 1 : betaCos
  const beta = Math.acos(betaCos) // Angle between c-line and servo arm
  return msPerRad * (gamma + beta - 3.14159) // Servo signal output, from neutral
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} pitch
 */
function pitchServo(x, y, z, pitch) {
  // Function to calculate the angle for the pitcher arm servos
  // Inputs are target x,y,z coords of receiver upper pivot in 1/100 of a mm
  // Also pitch in 1/100 of a degree
  pitch *= 0.0001745 // Convert to radians
  x += 5500 * Math.sin(0.2618 + pitch)
  y -= 5500 * Math.cos(0.2618 + pitch)
  x /= 100
  y /= 100
  z /= 100 // Convert to mm
  const bsq = 36250 - (75 + z) * (75 + z) // Equivalent arm length
  const gamma = Math.atan2(x, y) // Angle of line from servo pivot to receiver pivot
  const csq = x * x + y * y // Square of distance between servo pivot and receiver pivot
  const c = Math.sqrt(csq) // Distance between servo pivot and receiver pivot

  let betaCos = (csq + 5625 - bsq) / (150 * c)
  betaCos = betaCos < -1 ? -1 : betaCos > 1 ? 1 : betaCos

  const beta = Math.acos(betaCos) // Angle between c-line and servo arm

  return msPerRad * (gamma + beta - 3.14159) // Servo signal output, from neutral
}