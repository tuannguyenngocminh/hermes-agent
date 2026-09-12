import fs from 'node:fs'
import path from 'node:path'

const SUPER_AGENT_INSTRUCTION = path.join('resources', 'super-agent-instruction.md')

export function superAgentInstructionPath(hermesHome: string): string {
  return path.join(path.resolve(hermesHome), SUPER_AGENT_INSTRUCTION)
}

function writeAtomic(target: string, contents: string) {
  const temp = `${target}.tmp`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(temp, contents, 'utf8')
  fs.renameSync(temp, target)
}

export function ensureSuperAgentInstructionSetup({
  hermesHome,
  instructionSource
}: {
  hermesHome: string
  instructionSource: string
}): string {
  if (!fs.existsSync(instructionSource)) throw new Error(`bundled instruction is missing: ${instructionSource}`)

  const instructionPath = superAgentInstructionPath(hermesHome)
  const bundledInstruction = fs.readFileSync(instructionSource, 'utf8')
  const installedInstruction = fs.existsSync(instructionPath) ? fs.readFileSync(instructionPath, 'utf8') : null
  if (installedInstruction !== bundledInstruction) writeAtomic(instructionPath, bundledInstruction)
  return instructionPath
}
