import fs from 'node:fs'
import path from 'node:path'

const SUPER_AGENT_WORKFLOW_SKILL = path.join('skills', 'super-agent')

export function superAgentWorkflowSkillPath(hermesHome: string, workflowName: string): string {
  return path.join(path.resolve(hermesHome), SUPER_AGENT_WORKFLOW_SKILL, workflowName, 'SKILL.md')
}

function writeAtomic(target: string, contents: string) {
  const temp = `${target}.tmp`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(temp, contents, 'utf8')
  fs.renameSync(temp, target)
}

export function ensureSuperAgentWorkflowSetup({
  hermesHome,
  workflowName,
  workflowSource
}: {
  hermesHome: string
  workflowName: string
  workflowSource: string
}): string {
  if (!fs.existsSync(workflowSource)) throw new Error(`bundled workflow is missing: ${workflowSource}`)

  const skillPath = superAgentWorkflowSkillPath(hermesHome, workflowName)
  const bundledWorkflow = fs.readFileSync(workflowSource, 'utf8')
  const installedWorkflow = fs.existsSync(skillPath) ? fs.readFileSync(skillPath, 'utf8') : null
  if (installedWorkflow !== bundledWorkflow) writeAtomic(skillPath, bundledWorkflow)
  return skillPath
}
