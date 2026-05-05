import {Array, Option, pipe, String} from 'effect'

import ts from 'typescript'

import {assignmentOperators, isJsxLike, isNullishExpression, isUppercaseIdentifier} from '#lib/utils.ts'

export const controlFlowRules = [
	{
		name: 'control-flow-rules',
		apply(
			node: ts.Node,
			_references: Map<string, number>,
			report: (node: ts.Node, rule: string, message: string) => void,
			checker?: ts.TypeChecker
		) {
			if (
				!RegExp('\\.[^.]*test\\.[cm]?[jt]sx?$').test(node.getSourceFile().fileName) &&
				(isAsyncFunctionLike(node) || isTopLevelAwait(node))
			) {
				report(
					node,
					'no-async-await',
					'Do not use async/await. Model asynchronous work with Effect so concurrency, errors, and resources stay explicit.'
				)
			}

			if (ts.isTypeNode(node) && node.kind === ts.SyntaxKind.AnyKeyword) {
				report(
					node,
					'no-any',
					'Do not use `any`. Model the boundary with unknown plus narrowing, Schema, or a concrete inferred type.'
				)
			}

			if (ts.isThrowStatement(node)) {
				report(
					node,
					'no-throw',
					'Do not throw exceptions. Return typed failures with Effect, Result, or a schema-validated error boundary.'
				)
			}

			if (ts.isTryStatement(node)) {
				report(
					node,
					'no-try-catch',
					'Do not use raw try/catch. Use Effect.try, Effect.tryPromise, or Effect.catch* so failures stay typed and composable.'
				)
			}

			if (
				(ts.isExportAssignment(node) && !node.isExportEquals) ||
				((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) &&
					hasDefaultModifier(node)) ||
				(ts.isVariableStatement(node) && hasDefaultModifier(node))
			) {
				report(
					node,
					'no-default-export',
					'Do not use default exports. Export named values so imports stay explicit and mechanically searchable.'
				)
			}

			if (ts.isClassDeclaration(node) && !node.heritageClauses) {
				report(
					node.name ?? node,
					'no-class',
					'Do not create standalone classes. Classes are only allowed when extending an external class contract.'
				)
			}

			if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Error') {
				report(
					node.expression,
					'no-error-constructor',
					'Do not construct raw Error values. Use Effect failures with explicit domain data so error shape stays reviewable.'
				)
			}

			if (ts.isIdentifier(node) && checker) {
				analyzeRestrictedGlobal(node, report, checker)
			}

			if (ts.isVariableStatement(node) && isTopLevelMutableStatement(node)) {
				report(
					node.declarationList,
					'no-top-level-mutable-singleton',
					'Do not keep mutable file-scope state. Pass state through explicit values so behavior stays statically analyzable.'
				)
			}

			if ((ts.isAsExpression(node) && !isConstAssertion(node)) || ts.isTypeAssertionExpression(node)) {
				report(node, 'no-type-assertion', 'Remove `as` assertion. Inline, simplify, rewrite until inference works.')
			}

			if (node.kind === ts.SyntaxKind.NullKeyword && !isAllowedJsxNull(node)) {
				report(
					node,
					'no-null-literal',
					'Do not use `null`. Use absence with Option, omitted values, or bare return; only JSX empty branches may use null.'
				)
			}

			if (ts.isReturnStatement(node) && node.expression && isNullishExpression(node.expression)) {
				report(
					node.expression,
					'no-return-undefined-null',
					'Do not return `undefined` or `null` explicitly for an empty branch. Use bare `return` instead so the control flow says stop here without redundant sentinel values.'
				)
			}

			if (ts.isBinaryExpression(node) && assignmentOperators.has(node.operatorToken.kind)) {
				report(
					node.operatorToken,
					'no-mutation',
					'This assignment mutates existing state. Return a new value so data flow stays explicit.'
				)
			}

			if (
				ts.isForStatement(node) ||
				ts.isForInStatement(node) ||
				ts.isForOfStatement(node) ||
				ts.isWhileStatement(node) ||
				ts.isDoStatement(node)
			) {
				report(
					node,
					'no-imperative-array-transform',
					'This imperative loop hides control flow in mutable steps. Replace it with Effect, Stream, or collection combinators.'
				)
			}

			if (ts.isIfStatement(node) && node.elseStatement) {
				report(
					node.elseStatement,
					'no-else',
					'Remove the else branch. Use an early return so control flow stays flat and visible.'
				)
			}

			if (ts.isIfStatement(node)) {
				analyzeIfStatement(node, report)
			}

			if (checker && ts.isBlock(node)) {
				analyzeRedundantVoidReturn(node, report, checker)
			}

			if (ts.isBinaryExpression(node)) {
				analyzeAstTextComparison(node, report)
				analyzeBinaryExpression(node, report, checker)
			}

			if (ts.isPropertyAccessExpression(node)) {
				analyzePropertyAccess(node, report)
			}

			if (checker && ts.isPropertyAccessExpression(node)) {
				analyzeOptionalAccess(node, report, checker)
			}

			if (checker && ts.isElementAccessExpression(node)) {
				analyzeOptionalAccess(node, report, checker)
			}

			if (checker && ts.isCallExpression(node)) {
				analyzeDeprecatedCallExpression(node, report, checker)
				analyzeCallExpression(node, report, checker)
			}

			if (checker && ts.isNonNullExpression(node)) {
				analyzeNonNullExpression(node, report, checker)
			}

			if (checker && ts.isPrefixUnaryExpression(node)) {
				analyzePrefixUnaryExpression(node, report, checker)
			}

			if (ts.isConditionalExpression(node)) {
				analyzeConditionalExpression(node, report)
			}

			if (ts.isRegularExpressionLiteral(node)) {
				report(
					node,
					'no-regex-literal',
					'Use RegExp(...) instead of regex literals so pattern construction is explicit and mechanically searchable.'
				)
			}
		}
	}
]

function analyzeBinaryExpression(
	node: ts.BinaryExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker?: ts.TypeChecker
) {
	if (!checker) return

	analyzeNullishBinaryExpression(node, report, checker)
	analyzeNullishCoalescingExpression(node, report, checker)
	analyzeNullishCoalescingAssignment(node, report, checker)
	analyzeTypeofBinaryExpression(node, report, checker)
	analyzeInstanceofExpression(node, report, checker)
	analyzeInExpression(node, report, checker)
}

function analyzeIfStatement(node: ts.IfStatement, report: (node: ts.Node, rule: string, message: string) => void) {
	if (
		!node.elseStatement &&
		ts.isBlock(node.thenStatement) &&
		Array.length(node.thenStatement.statements) === 1 &&
		node.thenStatement.statements[0] &&
		ts.isReturnStatement(node.thenStatement.statements[0]) &&
		!String.includes('\n')(node.getText(node.getSourceFile())) &&
		String.length(
			`if (${String.replaceAll(RegExp('\\s+', 'g'), ' ')(node.expression.getText(node.getSourceFile()))}) ${String.replaceAll(RegExp('\\s+', 'g'), ' ')(node.thenStatement.statements[0].getText(node.getSourceFile()))}`
		) <= 120
	) {
		report(
			node.thenStatement,
			'no-braced-single-line-guard',
			'Remove braces from short single-return guards that fit on one line.'
		)
	}

	if (
		!(node.elseStatement || ts.isBlock(node.thenStatement)) &&
		String.includes('\n')(node.getText(node.getSourceFile()))
	) {
		report(
			node.thenStatement,
			'no-unbraced-multiline-guard',
			'Use braces when an if guard wraps across lines so the branch boundary stays visible.'
		)
	}
}

function analyzeAstTextComparison(
	node: ts.BinaryExpression,
	report: (node: ts.Node, rule: string, message: string) => void
) {
	if (
		isNullishComparisonOperator(node.operatorToken.kind) &&
		((isGetTextCall(node.left) && ts.isStringLiteralLike(node.right)) ||
			(isGetTextCall(node.right) && ts.isStringLiteralLike(node.left)))
	) {
		report(
			node,
			'no-ast-gettext-comparison',
			'Do not compare AST text output. Use syntax-kind predicates and node fields so the matched shape is explicit.'
		)
	}
}

function analyzeRedundantVoidReturn(
	node: ts.Block,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	if (!isInsideVoidReturningFunction(node, checker)) return

	Array.forEach(node.statements, (statement, index) => {
		if (!(ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression))) return

		pipe(
			node.statements,
			Array.get(index + 1),
			Option.match({
				onNone: () => undefined,
				onSome: nextStatement => {
					if (
						ts.isReturnStatement(nextStatement) &&
						!nextStatement.expression &&
						isVoidLikeType(checker.getTypeAtLocation(statement.expression))
					) {
						report(
							nextStatement,
							'no-redundant-void-return',
							'Return the void call directly instead of calling it and returning on the next line.'
						)
					}
				}
			})
		)
	})
}

function isInsideVoidReturningFunction(node: ts.Node, checker: ts.TypeChecker) {
	const functionLike = ts.findAncestor(node, ts.isFunctionLike)

	return !!functionLike && isVoidLikeType(checker.getSignatureFromDeclaration(functionLike)?.getReturnType())
}

function isGetTextCall(node: ts.Node) {
	return (
		ts.isCallExpression(node) &&
		ts.isPropertyAccessExpression(node.expression) &&
		node.expression.name.text === 'getText'
	)
}

function analyzePropertyAccess(
	node: ts.PropertyAccessExpression,
	report: (node: ts.Node, rule: string, message: string) => void
) {
	if (
		node.name.text === 'parent' &&
		ts.isPropertyAccessExpression(node.expression) &&
		node.expression.name.text === 'parent' &&
		!(ts.isPropertyAccessExpression(node.parent) && node.parent.name.text === 'parent')
	) {
		report(
			node.name,
			'no-deep-parent-chain',
			'Do not chain AST parent access. Use ts.findAncestor or a narrowed helper so the tree invariant is explicit.'
		)
	}

	if (
		node.name.text === 'length' &&
		!(ts.isIdentifier(node.expression) && Array.contains(['Array', 'String'], node.expression.text))
	) {
		report(
			node.name,
			'no-length-check',
			'Do not use `.length` directly. Use the matching Effect String or Array helper so intent and input type stay explicit.'
		)
	}
}

function isConstAssertion(node: ts.AsExpression) {
	return ts.isTypeReferenceNode(node.type) && ts.isIdentifier(node.type.typeName) && node.type.typeName.text === 'const'
}

function isAsyncFunctionLike(node: ts.Node) {
	return (
		(ts.isFunctionDeclaration(node) ||
			ts.isFunctionExpression(node) ||
			ts.isArrowFunction(node) ||
			ts.isMethodDeclaration(node)) &&
		Array.some(ts.getModifiers(node) ?? [], modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword)
	)
}

function isTopLevelAwait(node: ts.Node) {
	return ts.isAwaitExpression(node) && !ts.findAncestor(node, isAsyncFunctionLike)
}

const restrictedGlobalMessages = new Map([
	['global', 'Do not use global. Pass dependencies explicitly through Effect services.'],
	['globalThis', 'Do not use globalThis. Pass dependencies explicitly through Effect services.'],
	['location', 'Do not use global location. Use router state so navigation stays explicit and testable.'],
	['Array', "Do not use the global Array. Import Array from 'effect'."],
	['Option', "Do not use the global Option. Import Option from 'effect'."],
	['Number', "Do not use the global Number. Import Number from 'effect'."],
	['String', "Do not use the global String. Import String from 'effect'."],
	['Object', "Do not use the global Object. Import Record from 'effect'."],
	['Boolean', "Do not use the global Boolean. Import Boolean from 'effect'."],
	['Date', 'Do not use the global Date. Use Effect DateTime or inject time through an Effect service.']
])

function analyzeRestrictedGlobal(
	node: ts.Identifier,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	const message = restrictedGlobalMessages.get(node.text)

	if (!message || isDeclarationName(node) || isPropertyName(node) || isImportName(node)) return

	if (
		Array.isReadonlyArrayNonEmpty(checker.getSymbolAtLocation(node)?.declarations ?? []) &&
		Array.some(
			checker.getSymbolAtLocation(node)?.declarations ?? [],
			declaration =>
				ts.isImportSpecifier(declaration) ||
				ts.isImportClause(declaration) ||
				ts.isNamespaceImport(declaration) ||
				ts.isImportEqualsDeclaration(declaration) ||
				!declaration.getSourceFile().isDeclarationFile
		)
	) {
		return
	}

	report(node, 'no-restricted-global', message)
}

function isDeclarationName(node: ts.Identifier) {
	return (
		(ts.isVariableDeclaration(node.parent) && node.parent.name === node) ||
		(ts.isFunctionDeclaration(node.parent) && node.parent.name === node) ||
		(ts.isClassDeclaration(node.parent) && node.parent.name === node) ||
		(ts.isParameter(node.parent) && node.parent.name === node) ||
		(ts.isTypeAliasDeclaration(node.parent) && node.parent.name === node) ||
		(ts.isInterfaceDeclaration(node.parent) && node.parent.name === node)
	)
}

function isPropertyName(node: ts.Identifier) {
	return (
		(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) ||
		(ts.isPropertyAssignment(node.parent) && node.parent.name === node) ||
		(ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node) ||
		(ts.isPropertySignature(node.parent) && node.parent.name === node)
	)
}

function isImportName(node: ts.Identifier) {
	return (
		ts.isImportSpecifier(node.parent) ||
		ts.isImportClause(node.parent) ||
		ts.isNamespaceImport(node.parent) ||
		ts.isImportEqualsDeclaration(node.parent)
	)
}

function hasDefaultModifier(node: ts.HasModifiers) {
	return Array.some(ts.getModifiers(node) ?? [], modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)
}

function analyzeOptionalAccess(
	node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	if (!node.questionDotToken || isAnyOrUnknown(checker.getTypeAtLocation(node.expression))) return

	if (isNonNullableType(checker.getTypeAtLocation(node.expression), checker)) {
		reportRedundantTypeCheck(
			node.questionDotToken,
			report,
			'Optional access checks for nullish state that the TypeScript type already excludes.'
		)
	}
}

function analyzeCallExpression(
	node: ts.CallExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	analyzeOptionalCall(node, report, checker)
	analyzeArrayIsArrayCall(node, report, checker)
}

function analyzeDeprecatedCallExpression(
	node: ts.CallExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	const deprecatedTag = pipe(
		checker.getSymbolAtLocation(ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression)
			?.declarations ?? [],
		Array.flatMap(declaration => ts.getJSDocTags(declaration)),
		Array.findFirst(tag => tag.tagName.text === 'deprecated')
	)

	if (Option.isSome(deprecatedTag)) {
		if (deprecatedTag.value.comment && typeof deprecatedTag.value.comment === 'string') {
			return report(
				ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression,
				'no-deprecated-api',
				`Do not call deprecated APIs. ${deprecatedTag.value.comment}`
			)
		}

		report(
			ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression,
			'no-deprecated-api',
			'Do not call deprecated APIs. Use the replacement named by the owning package.'
		)
	}
}

function analyzeOptionalCall(
	node: ts.CallExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	if (!node.questionDotToken || isAnyOrUnknown(checker.getTypeAtLocation(node.expression))) return

	if (isNonNullableType(checker.getTypeAtLocation(node.expression), checker)) {
		reportRedundantTypeCheck(
			node.questionDotToken,
			report,
			'Optional call checks for nullish state that the TypeScript type already excludes.'
		)
	}
}

function analyzeArrayIsArrayCall(
	node: ts.CallExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	if (
		Array.length(node.arguments) !== 1 ||
		!ts.isPropertyAccessExpression(node.expression) ||
		!ts.isIdentifier(node.expression.expression) ||
		node.expression.expression.text !== 'Array' ||
		node.expression.name.text !== 'isArray'
	) {
		return
	}

	const type = checker.getTypeAtLocation(pipe(node.arguments, Array.head, Option.getOrThrow))

	if (isAnyOrUnknown(type)) return

	if (isAlwaysArrayType(type, checker) || isAlwaysNonArrayType(type, checker)) {
		reportRedundantTypeCheck(node, report, 'Array.isArray checks a shape that the TypeScript type already proves.')
	}
}

function analyzeNonNullExpression(
	node: ts.NonNullExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	const type = checker.getTypeAtLocation(node.expression)

	if (!isAnyOrUnknown(type) && isNonNullableType(type, checker)) {
		reportRedundantTypeCheck(
			node,
			report,
			'Non-null assertion repeats nullish state that the TypeScript type already excludes.'
		)
	}
}

function analyzePrefixUnaryExpression(
	node: ts.PrefixUnaryExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	if (node.operator !== ts.SyntaxKind.ExclamationToken) return

	const type = checker.getTypeAtLocation(node.operand)

	if (!isAnyOrUnknown(type) && isAlwaysTruthy(type)) {
		reportRedundantTypeCheck(
			node,
			report,
			'Truthiness check is impossible because the TypeScript type excludes every falsy value.'
		)
	}
}

function analyzeNullishBinaryExpression(
	node: ts.BinaryExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	const checked = checkedNullishSide(node)

	if (!checked || isAnyOrUnknown(checker.getTypeAtLocation(checked.expression))) return

	if (
		isNonNullableType(checker.getTypeAtLocation(checked.expression), checker) ||
		isAlwaysCheckedNullish(checker.getTypeAtLocation(checked.expression), checked.nullish)
	) {
		reportRedundantTypeCheck(
			node,
			report,
			'Nullish comparison checks a state that the TypeScript type already excludes.'
		)
	}
}

function analyzeNullishCoalescingAssignment(
	node: ts.BinaryExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	if (node.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionEqualsToken) return

	const type = checker.getTypeAtLocation(node.left)

	if (!isAnyOrUnknown(type) && isNonNullableType(type, checker)) {
		reportRedundantTypeCheck(
			node.operatorToken,
			report,
			'Nullish assignment fallback is unreachable because the TypeScript type already excludes nullish state.'
		)
	}
}

function analyzeNullishCoalescingExpression(
	node: ts.BinaryExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	if (node.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken) return

	const type = checker.getTypeAtLocation(node.left)

	if (!isAnyOrUnknown(type) && isNonNullableType(type, checker)) {
		reportRedundantTypeCheck(
			node.operatorToken,
			report,
			'Nullish fallback is unreachable because the TypeScript type already excludes nullish state.'
		)
	}
}

function analyzeTypeofBinaryExpression(
	node: ts.BinaryExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	const check = typeofCheck(node)

	if (!check || isAnyOrUnknown(checker.getTypeAtLocation(check.expression))) return

	if (
		isAlwaysTypeof(checker.getTypeAtLocation(check.expression), check.kind) ||
		isNeverTypeof(checker.getTypeAtLocation(check.expression), check.kind)
	) {
		reportRedundantTypeCheck(
			node,
			report,
			'Runtime typeof check repeats information already known by the TypeScript type.'
		)
	}
}

function analyzeInstanceofExpression(
	node: ts.BinaryExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	if (
		node.operatorToken.kind !== ts.SyntaxKind.InstanceOfKeyword ||
		isAnyOrUnknown(checker.getTypeAtLocation(node.left))
	) {
		return
	}

	const instanceType = instanceTypeOf(node.right, checker)

	if (instanceType && isAlwaysAssignableTo(checker.getTypeAtLocation(node.left), instanceType, checker)) {
		reportRedundantTypeCheck(
			node,
			report,
			'Runtime instanceof check repeats information already known by the TypeScript type.'
		)
	}
}

function analyzeInExpression(
	node: ts.BinaryExpression,
	report: (node: ts.Node, rule: string, message: string) => void,
	checker: ts.TypeChecker
) {
	if (
		node.operatorToken.kind !== ts.SyntaxKind.InKeyword ||
		!(ts.isStringLiteral(node.left) || ts.isNoSubstitutionTemplateLiteral(node.left)) ||
		isAnyOrUnknown(checker.getTypeAtLocation(node.right))
	) {
		return
	}

	if (hasRequiredProperty(checker.getTypeAtLocation(node.right), node.left.text)) {
		reportRedundantTypeCheck(
			node,
			report,
			'Property existence check repeats a required property already known by the TypeScript type.'
		)
	}
}

function analyzeConditionalExpression(
	node: ts.ConditionalExpression,
	report: (node: ts.Node, rule: string, message: string) => void
) {
	if (String.includes('\n')(node.getText(node.getSourceFile())) && !isAllowedJsxBranchTernary(node)) {
		report(
			node,
			'no-multiline-ternary',
			'Do not use ternaries that wrap across lines. Use early returns, Match, or module match helpers so branches stay readable.'
		)
	}

	if (
		(isJsxLike(node.whenTrue) && isNullishExpression(node.whenFalse)) ||
		(isJsxLike(node.whenFalse) && isNullishExpression(node.whenTrue))
	) {
		report(
			node,
			'no-ternary-in-jsx',
			'When one branch is empty, use condition && <...> instead of a ternary with null or undefined.'
		)
	}
}

function isAllowedJsxBranchTernary(node: ts.ConditionalExpression) {
	return (
		ts.isJsxExpression(node.parent) &&
		node.parent.expression === node &&
		!isNullishExpression(node.whenTrue) &&
		!isNullishExpression(node.whenFalse)
	)
}

function isAllowedJsxNull(node: ts.Node) {
	return (
		(ts.isConditionalExpression(node.parent) &&
			(isJsxLike(node.parent.whenTrue) || isJsxLike(node.parent.whenFalse))) ||
		(ts.isJsxExpression(node.parent) && node.parent.expression === node) ||
		isJsonStringifyReplacer(node) ||
		isInsideUseRefCall(node) ||
		isComponentEmptyReturn(node)
	)
}

function isJsonStringifyReplacer(node: ts.Node) {
	return (
		ts.isCallExpression(node.parent) &&
		node.parent.arguments[1] === node &&
		ts.isPropertyAccessExpression(node.parent.expression) &&
		ts.isIdentifier(node.parent.expression.expression) &&
		node.parent.expression.expression.text === 'JSON' &&
		node.parent.expression.name.text === 'stringify'
	)
}

function isInsideUseRefCall(node: ts.Node) {
	return !!ts.findAncestor(
		node,
		element =>
			ts.isCallExpression(element) &&
			ts.isIdentifier(element.expression) &&
			element.expression.text === 'useRef' &&
			element.pos <= node.pos &&
			node.end <= element.end
	)
}

function isComponentEmptyReturn(node: ts.Node) {
	return !!ts.findAncestor(
		node,
		element =>
			ts.isReturnStatement(element) &&
			element.expression === node &&
			!!ts.findAncestor(
				element,
				ancestor => ts.isFunctionDeclaration(ancestor) && !!ancestor.name && isUppercaseIdentifier(ancestor.name)
			)
	)
}

function checkedNullishSide(node: ts.BinaryExpression) {
	if (!isNullishComparisonOperator(node.operatorToken.kind)) return

	if (isNullishExpression(node.left)) return {expression: node.right, nullish: node.left}

	if (isNullishExpression(node.right)) return {expression: node.left, nullish: node.right}
}

function isNullishComparisonOperator(kind: ts.SyntaxKind) {
	return (
		kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
		kind === ts.SyntaxKind.EqualsEqualsToken ||
		kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
		kind === ts.SyntaxKind.ExclamationEqualsToken
	)
}

function typeofCheck(node: ts.BinaryExpression) {
	if (!isNullishComparisonOperator(node.operatorToken.kind)) return

	if (ts.isTypeOfExpression(node.left) && ts.isStringLiteralLike(node.right)) {
		return {expression: node.left.expression, kind: node.right.text}
	}

	if (ts.isTypeOfExpression(node.right) && ts.isStringLiteralLike(node.left)) {
		return {expression: node.right.expression, kind: node.left.text}
	}
}

function reportRedundantTypeCheck(
	node: ts.Node,
	report: (node: ts.Node, rule: string, message: string) => void,
	message: string
) {
	report(node, 'no-redundant-type-check', message)
}

function isAnyOrUnknown(type: ts.Type) {
	return hasTypeFlag(type, ts.TypeFlags.Any) || hasTypeFlag(type, ts.TypeFlags.Unknown)
}

function isVoidLikeType(type: ts.Type | undefined) {
	return !!type && typeParts(type).every(part => (part.flags & ts.TypeFlags.Void) !== 0)
}

function isNonNullableType(type: ts.Type, _checker: ts.TypeChecker) {
	return !(
		hasTypeFlag(type, ts.TypeFlags.Null) ||
		hasTypeFlag(type, ts.TypeFlags.Undefined) ||
		hasTypeFlag(type, ts.TypeFlags.Void)
	)
}

function hasTypeFlag(type: ts.Type, flag: ts.TypeFlags): boolean {
	return type.isUnion() ? type.types.some(part => hasTypeFlag(part, flag)) : (type.flags & flag) !== 0
}

function typeParts(type: ts.Type) {
	return type.isUnion() ? type.types : [type]
}

function isAlwaysArrayType(type: ts.Type, checker: ts.TypeChecker) {
	return typeParts(type).every(part => checker.isArrayType(part) || checker.isTupleType(part))
}

function isAlwaysNonArrayType(type: ts.Type, checker: ts.TypeChecker) {
	return typeParts(type).every(
		part => !(checker.isArrayType(part) || checker.isTupleType(part)) && isPrimitiveType(part)
	)
}

function isPrimitiveType(type: ts.Type) {
	return (
		(type.flags & ts.TypeFlags.StringLike) !== 0 ||
		(type.flags & ts.TypeFlags.NumberLike) !== 0 ||
		(type.flags & ts.TypeFlags.BooleanLike) !== 0 ||
		(type.flags & ts.TypeFlags.BigIntLike) !== 0 ||
		(type.flags & ts.TypeFlags.ESSymbolLike) !== 0 ||
		(type.flags & ts.TypeFlags.Null) !== 0 ||
		(type.flags & ts.TypeFlags.Undefined) !== 0
	)
}

function isAlwaysTypeof(type: ts.Type, kind: string) {
	return typeParts(type).every(part => isTypeofKind(part, kind))
}

function isNeverTypeof(type: ts.Type, kind: string) {
	return typeParts(type).every(part => isPrimitiveType(part) && !isTypeofKind(part, kind))
}

function isTypeofKind(type: ts.Type, kind: string) {
	if (kind === 'string') return (type.flags & ts.TypeFlags.StringLike) !== 0

	if (kind === 'number') return (type.flags & ts.TypeFlags.NumberLike) !== 0

	if (kind === 'boolean') return (type.flags & ts.TypeFlags.BooleanLike) !== 0

	if (kind === 'bigint') return (type.flags & ts.TypeFlags.BigIntLike) !== 0

	if (kind === 'symbol') return (type.flags & ts.TypeFlags.ESSymbolLike) !== 0

	if (kind === 'undefined') return (type.flags & ts.TypeFlags.Undefined) !== 0

	if (kind === 'function') return Array.isReadonlyArrayNonEmpty(type.getCallSignatures())

	return false
}

function instanceTypeOf(node: ts.Expression, checker: ts.TypeChecker) {
	return pipe(
		checker.getTypeAtLocation(node).getConstructSignatures(),
		Array.head,
		Option.map(signature => signature.getReturnType()),
		Option.getOrUndefined
	)
}

function isAlwaysAssignableTo(type: ts.Type, target: ts.Type, checker: ts.TypeChecker) {
	return typeParts(type).every(part => checker.isTypeAssignableTo(part, target))
}

function hasRequiredProperty(type: ts.Type, propertyName: string) {
	return typeParts(type).every(part => {
		const property = part.getProperty(propertyName)

		return !!property && (property.flags & ts.SymbolFlags.Optional) === 0
	})
}

function isAlwaysCheckedNullish(type: ts.Type, expression: ts.Expression) {
	if (expression.kind === ts.SyntaxKind.NullKeyword) {
		return typeParts(type).every(part => (part.flags & ts.TypeFlags.Null) !== 0)
	}

	if (ts.isIdentifier(expression) && expression.text === 'undefined') {
		return typeParts(type).every(part => (part.flags & ts.TypeFlags.Undefined) !== 0)
	}

	return typeParts(type).every(
		part => (part.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) !== 0
	)
}

function isAlwaysTruthy(type: ts.Type) {
	return typeParts(type).every(
		part =>
			(part.flags & ts.TypeFlags.BooleanLiteral) === 0 &&
			(part.flags & ts.TypeFlags.NumberLiteral) === 0 &&
			(part.flags & ts.TypeFlags.StringLiteral) === 0 &&
			(part.flags & ts.TypeFlags.BigIntLiteral) === 0 &&
			(part.flags & ts.TypeFlags.Null) === 0 &&
			(part.flags & ts.TypeFlags.Undefined) === 0 &&
			(part.flags & ts.TypeFlags.BooleanLike) === 0 &&
			(part.flags & ts.TypeFlags.NumberLike) === 0 &&
			(part.flags & ts.TypeFlags.StringLike) === 0 &&
			(part.flags & ts.TypeFlags.BigIntLike) === 0
	)
}

function isTopLevelMutableStatement(node: ts.VariableStatement) {
	return node.parent.kind === ts.SyntaxKind.SourceFile && (node.declarationList.flags & ts.NodeFlags.Let) !== 0
}
