import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { load, move } from './animate.js'
import { write } from './control.js'

let animationFrameRequestId = 0

const el = document.querySelector('#app')
const { group, objects } = await load()

const computeAspectRatio = () => {
  const viewport = el.getBoundingClientRect()
  return viewport.width / viewport.height
}

const renderer = new THREE.WebGLRenderer()
const scene = new THREE.Scene()
scene.add(group)

const camera = new THREE.PerspectiveCamera(50, computeAspectRatio(), 0.1, 1000)
camera.position.set(250, 490, 200)
camera.up.set(0, 0, 1)

const controls = new OrbitControls(camera, renderer.domElement)
controls.maxDistance = 700
controls.target.set(-60, 30, -15)
controls.update()

const dirLight = new THREE.DirectionalLight(0xffffff, 1)
dirLight.position.set(5, 5, 5)
scene.add(dirLight)
scene.add(new THREE.AmbientLight(0xffffff, 1))

el.innerHTML = ''
el.appendChild(renderer.domElement)

function resizeListener() {
  const viewport = el.getBoundingClientRect()
  camera.aspect = computeAspectRatio()
  camera.updateProjectionMatrix()
  renderer.setSize(viewport.width, viewport.height)
}

function animate() {
  animationFrameRequestId = requestAnimationFrame(animate)
  controls.update()
  move(objects)
  renderer.render(scene, camera)
}

animate()

window.addEventListener('resize', resizeListener)
const resizeObserver = new ResizeObserver(resizeListener)
resizeObserver.observe(el)

const run = async () => {
  const r = await fetch('/demo.tcode')
  const tcode = await r.text()
  for (const ln of tcode.split('\n')) {
    write(`${ln}\n`)
    await new Promise((r) => setTimeout(r, 16))
  }
}

run()
window.run = run

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    resizeObserver.unobserve(el)
    window.removeEventListener('resize', resizeListener)
    window.cancelAnimationFrame(animationFrameRequestId)
    el.innerHTML = ''
    renderer.dispose()
    renderer.forceContextLoss()
  })
}
