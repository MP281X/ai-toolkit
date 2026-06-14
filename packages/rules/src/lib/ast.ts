export type Node = {readonly parent?: Node; readonly type: string}

export type IdentifierNode = Node & {readonly name: string; readonly type: 'Identifier'}

export type LiteralNode = Node & {readonly type: 'Literal'; readonly value?: unknown}

export type TemplateElementNode = Node & {
	readonly type: 'TemplateElement'
	readonly value?: {readonly cooked?: string; readonly raw?: string}
}

export type MemberExpressionNode = Node & {
	readonly computed?: boolean
	readonly object: Node
	readonly property: Node
	readonly type: 'MemberExpression'
}

export type ChainExpressionNode = Node & {readonly expression: Node; readonly type: 'ChainExpression'}

export type CallExpressionNode = Node & {
	readonly arguments?: readonly Node[]
	readonly callee: Node
	readonly type: 'CallExpression'
}

export type NewExpressionNode = Node & {
	readonly arguments?: readonly Node[]
	readonly callee: Node
	readonly type: 'NewExpression'
}

export type VariableDeclaratorNode = Node & {
	readonly id: Node
	readonly init?: Node
	readonly type: 'VariableDeclarator'
}

export type VariableDeclarationNode = Node & {
	readonly declarations?: readonly Node[]
	readonly kind?: string
	readonly type: 'VariableDeclaration'
}

export type FunctionLikeNode = Node & {
	readonly body?: Node
	readonly params?: readonly Node[]
	readonly returnType?: Node | null
}

export type BlockStatementNode = Node & {readonly body?: readonly Node[]; readonly type: 'BlockStatement'}

export type ReturnStatementNode = Node & {readonly argument?: Node | null; readonly type: 'ReturnStatement'}

export type ImportDeclarationNode = Node & {
	readonly source?: LiteralNode
	readonly specifiers?: readonly Node[]
	readonly type: 'ImportDeclaration'
}

export type ImportSpecifierNode = Node & {
	readonly imported?: Node
	readonly local?: Node
	readonly type: 'ImportSpecifier'
}

export type TSAsExpressionNode = Node & {
	readonly expression: Node
	readonly type: 'TSAsExpression'
	readonly typeAnnotation?: Node
}

export type TSTypeAssertionNode = Node & {
	readonly expression: Node
	readonly type: 'TSTypeAssertion'
	readonly typeAnnotation?: Node
}

export type TSTypeReferenceNode = Node & {readonly type: 'TSTypeReference'; readonly typeName?: Node}

export type PropertyNode = Node & {readonly key?: Node; readonly value?: Node}

export type TemplateLiteralNode = Node & {
	readonly expressions?: readonly Node[]
	readonly quasis?: readonly TemplateElementNode[]
	readonly type: 'TemplateLiteral'
}

export type JSXAttributeNode = Node & {readonly name?: Node; readonly type: 'JSXAttribute'; readonly value?: Node}

export type JSXIdentifierNode = Node & {readonly name: string; readonly type: 'JSXIdentifier'}

export type JSXExpressionContainerNode = Node & {readonly expression?: Node; readonly type: 'JSXExpressionContainer'}

export type ReportDescriptor = {readonly message: string; readonly node: Node}

export type RuleContext = {readonly filename?: string; readonly report: (descriptor: ReportDescriptor) => void}

export type RuleVisitors = Readonly<Partial<Record<string, (node: Node) => void>>>

export function isNode(value: unknown): value is Node {
	return typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
}

export function isIdentifier(node: Node | undefined): node is IdentifierNode {
	return node?.type === 'Identifier' && 'name' in node && typeof node.name === 'string'
}

export function isJSXIdentifier(node: Node | undefined): node is JSXIdentifierNode {
	return node?.type === 'JSXIdentifier' && 'name' in node && typeof node.name === 'string'
}

export function isLiteral(node: Node | undefined): node is LiteralNode {
	return node?.type === 'Literal'
}

export function isTemplateElement(node: Node | undefined): node is TemplateElementNode {
	return node?.type === 'TemplateElement'
}

export function isMemberExpression(node: Node | undefined): node is MemberExpressionNode {
	return (
		node?.type === 'MemberExpression' &&
		'object' in node &&
		isNode(node.object) &&
		'property' in node &&
		isNode(node.property)
	)
}

export function isChainExpression(node: Node | undefined): node is ChainExpressionNode {
	return node?.type === 'ChainExpression' && 'expression' in node && isNode(node.expression)
}

export function isCallExpression(node: Node | undefined): node is CallExpressionNode {
	return node?.type === 'CallExpression' && 'callee' in node && isNode(node.callee)
}

export function isNewExpression(node: Node | undefined): node is NewExpressionNode {
	return node?.type === 'NewExpression' && 'callee' in node && isNode(node.callee)
}

export function isVariableDeclarator(node: Node | undefined): node is VariableDeclaratorNode {
	return node?.type === 'VariableDeclarator' && 'id' in node && isNode(node.id)
}

export function isVariableDeclaration(node: Node | undefined): node is VariableDeclarationNode {
	return node?.type === 'VariableDeclaration'
}

export function isImportDeclaration(node: Node | undefined): node is ImportDeclarationNode {
	return node?.type === 'ImportDeclaration'
}

export function isImportSpecifier(node: Node | undefined): node is ImportSpecifierNode {
	return node?.type === 'ImportSpecifier'
}

export function isTSAsExpression(node: Node | undefined): node is TSAsExpressionNode {
	return node?.type === 'TSAsExpression' && 'expression' in node && isNode(node.expression)
}

export function isTSTypeAssertion(node: Node | undefined): node is TSTypeAssertionNode {
	return node?.type === 'TSTypeAssertion' && 'expression' in node && isNode(node.expression)
}

export function isTSTypeReference(node: Node | undefined): node is TSTypeReferenceNode {
	return node?.type === 'TSTypeReference'
}

export function isProperty(node: Node | undefined): node is PropertyNode {
	return node?.type === 'Property'
}

export function isTemplateLiteral(node: Node | undefined): node is TemplateLiteralNode {
	return node?.type === 'TemplateLiteral'
}

export function isJSXAttribute(node: Node | undefined): node is JSXAttributeNode {
	return node?.type === 'JSXAttribute'
}

export function isJSXExpressionContainer(node: Node | undefined): node is JSXExpressionContainerNode {
	return node?.type === 'JSXExpressionContainer'
}

export function isFunctionLike(node: Node | undefined): node is FunctionLikeNode {
	return (
		node?.type === 'FunctionDeclaration' ||
		node?.type === 'FunctionExpression' ||
		node?.type === 'ArrowFunctionExpression'
	)
}

export function isBlockStatement(node: Node | undefined): node is BlockStatementNode {
	return node?.type === 'BlockStatement'
}

export function isReturnStatement(node: Node | undefined): node is ReturnStatementNode {
	return node?.type === 'ReturnStatement'
}

export function isReadonlyArray(value: unknown): value is readonly unknown[] {
	return Object.prototype.toString.call(value) === '[object Array]'
}

export function unwrapChain(node: Node): Node {
	return isChainExpression(node) ? unwrapChain(node.expression) : node
}

export function staticName(node: Node | undefined): string | undefined {
	if (isIdentifier(node) || isJSXIdentifier(node)) return node.name
	if (isLiteral(node) && typeof node.value === 'string') return node.value
	return undefined
}

export function staticMemberName(node: Node): string | undefined {
	const member = unwrapChain(node)
	if (!isMemberExpression(member)) return undefined
	return staticName(member.property)
}

export function staticMemberObjectName(node: Node): string | undefined {
	const member = unwrapChain(node)
	if (!isMemberExpression(member)) return undefined
	return staticName(member.object)
}

export function calleeStaticName(node: CallExpressionNode): string | undefined {
	const callee = unwrapChain(node.callee)
	if (isIdentifier(callee)) return callee.name
	return staticMemberName(node.callee)
}

export function isNamespaceMemberCall(
	node: CallExpressionNode,
	namespace: string,
	names: ReadonlySet<string>
): boolean {
	const callee = unwrapChain(node.callee)
	if (!isMemberExpression(callee)) return false
	return staticName(callee.object) === namespace && names.has(staticName(callee.property) ?? '')
}

export function isStringLiteralNode(node: Node | undefined, value: string): boolean {
	return isLiteral(node) && node.value === value
}

export function forEachChild(node: Node, visit: (node: Node) => void): void {
	for (const value of Object.values(node)) {
		if (value === node.parent) continue
		if (isNode(value)) {
			visit(value)
			continue
		}
		if (!isReadonlyArray(value)) continue
		for (const item of value) {
			if (isNode(item)) visit(item)
		}
	}
}
