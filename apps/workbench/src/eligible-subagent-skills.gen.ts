import {Schema} from 'effect'

export const EligibleSubagentSkill = Schema.Literals([
	'engineering',
	'git-operations',
	'implementation',
	'planning',
	'review',
	'skill-writing',
	'testing'
] as const)
