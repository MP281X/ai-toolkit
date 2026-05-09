import {Array, Option, pipe} from 'effect'

import ts from 'typescript'

import {isAccessExpression, isLiteral, isTerminalStatement, normalizedText, returnedExpression} from '#lib/ts.ts'
import type {Rule} from './helpers.ts'
import {containsComments, isMatchHandlerCall, rule} from './helpers.ts'

export const controlFlowRules = [
	rule('no-iife', (node, context) => {
		if (!ts.isCallExpression(node)) return
		function reportIifeExpression(expression: ts.Expression): void {
			if (ts.isParenthesizedExpression(expression)) {
				reportIifeExpression(expression.expression)
				return
			}
			if (!(ts.isFunctionExpression(expression) || ts.isArrowFunction(expression))) return
			context.report(
				expression,
				'no-iife',
				'This immediately invokes a function expression. Move the logic into ordinary surrounding flow or a named function boundary.'
			)
		}
		reportIifeExpression(node.expression)
	}),
	rule('prefer-match-for-pattern-branching', (node, context) => {
		if (ts.isSwitchStatement(node) && isAccessExpression(node.expression)) {
			context.report(
				node.expression,
				'prefer-match-for-pattern-branching',
				`This switch matches patterns over "${normalizedText(node.expression)}". Replace the switch with an Effect Match pipeline and keep the matched value unasserted.`
			)
		}
	}),
	rule('require-as-const-match-output-literals', (node, context) => {
		if (!(ts.isCallExpression(node) && isMatchHandlerCall(node))) return
		pipe(
			Array.get(node.arguments, node.arguments.length - 1),
			Option.map(callback => {
				return ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)
					? returnedExpression(callback)
					: undefined
			}),
			Option.match({
				onNone: () => undefined,
				onSome: expression => {
					return expression && isLiteral(expression) && expression.kind !== ts.SyntaxKind.NullKeyword
						? context.report(
								expression,
								'require-as-const-match-output-literals',
								`This Match handler returns literal "${normalizedText(expression)}" as a widened type. Add as const to the returned literal only.`
							)
						: undefined
				}
			})
		)
	}),
	rule('prefer-early-return-over-else', (node, context) => {
		if (!(ts.isIfStatement(node) && node.elseStatement)) return
		const statement = ts.isBlock(node.thenStatement) ? node.thenStatement.statements[0] : node.thenStatement
		if (statement && isTerminalStatement(statement)) {
			context.report(
				node.elseStatement,
				'prefer-early-return-over-else',
				'This else follows a branch that exits. Remove the else block and place its statements after the if.'
			)
		}
	}),
	rule('prefer-match-for-reassignment-selection', (node, context) => {
		if (!(ts.isVariableStatement(node) && (node.declarationList.flags & ts.NodeFlags.Let) !== 0)) return
		if (!(ts.isBlock(node.parent) || ts.isSourceFile(node.parent))) return
		for (const declaration of node.declarationList.declarations) {
			if (!(ts.isIdentifier(declaration.name) && declaration.initializer)) continue
			pipe(
				Array.findFirstIndex(
					ts.isBlock(node.parent) || ts.isSourceFile(node.parent) ? node.parent.statements : [],
					statement => statement === node
				),
				Option.map(index => {
					return pipe(
						ts.isBlock(node.parent) || ts.isSourceFile(node.parent) ? node.parent.statements : [],
						Array.drop(index + 1),
						Array.takeWhile(ts.isIfStatement),
						statements => {
							return (
								Array.length(statements) > 1 &&
								Array.every(statements, statement => {
									let assignment: ts.ExpressionStatement | undefined
									if (ts.isExpressionStatement(statement.thenStatement)) assignment = statement.thenStatement
									if (ts.isBlock(statement.thenStatement) && statement.thenStatement.statements.length === 1) {
										if (
											statement.thenStatement.statements[0] &&
											ts.isExpressionStatement(statement.thenStatement.statements[0])
										) {
											assignment = statement.thenStatement.statements[0]
										}
									}
									return (
										assignment !== undefined &&
										ts.isBinaryExpression(assignment.expression) &&
										assignment.expression.operatorToken.kind === ts.SyntaxKind.FirstAssignment &&
										ts.isIdentifier(assignment.expression.left) &&
										assignment.expression.left.text === declaration.name.getText(context.sourceFile) &&
										isAccessExpression(statement.expression)
									)
								})
							)
						}
					)
				}),
				Option.getOrElse(() => false)
			)
				? context.report(
						declaration.name,
						'prefer-match-for-reassignment-selection',
						`"${declaration.name.getText(context.sourceFile)}" is selected by repeated reassignment branches. Replace the mutable variable with one Effect Match expression that returns the selected value.`
					)
				: undefined
		}
	}),
	rule('prefer-minimal-if-braces', (node, context) => {
		if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
			if (
				context.sourceFile.getLineAndCharacterOfPosition(node.body.getStart(context.sourceFile)).line !==
				context.sourceFile.getLineAndCharacterOfPosition(node.equalsGreaterThanToken.getStart(context.sourceFile)).line
			) {
				context.report(
					node.body,
					'prefer-minimal-if-braces',
					'This arrow expression body spans lines. Convert it to a block body and return the expression explicitly.'
				)
			}
		}
		if (!ts.isIfStatement(node)) return
		if (
			ts.isBlock(node.thenStatement) &&
			node.thenStatement.statements.length === 1 &&
			!containsComments(node.thenStatement)
		) {
			if (
				node.thenStatement.statements[0] &&
				context.sourceFile.getLineAndCharacterOfPosition(node.getStart(context.sourceFile)).character +
					`if (${normalizedText(node.expression)}) ${normalizedText(node.thenStatement.statements[0])}`.length <=
					100 &&
				context.sourceFile.getLineAndCharacterOfPosition(node.expression.getStart(context.sourceFile)).line ===
					context.sourceFile.getLineAndCharacterOfPosition(node.thenStatement.getStart(context.sourceFile)).line
			) {
				context.report(
					node.thenStatement,
					'prefer-minimal-if-braces',
					'This if branch has an unnecessary one-statement block. Remove the braces and keep the branch on one line.'
				)
			}
		}
		if (
			!ts.isBlock(node.thenStatement) &&
			(context.sourceFile.getLineAndCharacterOfPosition(node.getStart(context.sourceFile)).character +
				`if (${normalizedText(node.expression)}) ${normalizedText(node.thenStatement)}`.length >
				120 ||
				context.sourceFile.getLineAndCharacterOfPosition(node.thenStatement.getStart(context.sourceFile)).line !==
					context.sourceFile.getLineAndCharacterOfPosition(node.expression.getStart(context.sourceFile)).line)
		) {
			context.report(
				node.thenStatement,
				'prefer-minimal-if-braces',
				'This braceless if branch is multiline or too long. Add braces and put the branch body inside the block.'
			)
		}
	})
] as const satisfies readonly Rule[]
