import fs from 'node:fs'
import path from 'node:path'

const DAILY_REVIEW_SKILL = path.join('skills', 'super-agent', 'sieu-tro-ly-ra-soat-hang-ngay', 'SKILL.md')

export function dailyReviewSkillPath(hermesHome: string): string {
  return path.join(path.resolve(hermesHome), DAILY_REVIEW_SKILL)
}

function writeAtomic(target: string, contents: string) {
  const temp = `${target}.tmp`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(temp, contents, 'utf8')
  fs.renameSync(temp, target)
}

export function ensureDailyReviewSkillSetup({ hermesHome, workflowSource }: { hermesHome: string; workflowSource: string }): string {
  if (!fs.existsSync(workflowSource)) throw new Error(`Bundled daily-review workflow is missing: ${workflowSource}`)
  const skillPath = dailyReviewSkillPath(hermesHome)
  const bundledWorkflow = fs.readFileSync(workflowSource, 'utf8')
  const installedWorkflow = fs.existsSync(skillPath) ? fs.readFileSync(skillPath, 'utf8') : null
  if (installedWorkflow !== bundledWorkflow) writeAtomic(skillPath, bundledWorkflow)
  return skillPath
}
