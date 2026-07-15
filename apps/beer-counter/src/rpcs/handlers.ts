import {Effect} from 'effect'

import {BeerCounter} from '#lib/beerCounter.ts'
import {RpcContracts} from '#rpcs/contracts.ts'

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		const beerCounter = yield* BeerCounter

		return RpcContracts.of({
			'admin.add': payload => beerCounter.add(payload, payload.name),
			'admin.adjust': payload => beerCounter.adjust(payload, payload.id, payload.amount, payload.direction),
			'admin.authenticate': payload => beerCounter.authenticate(payload),
			'admin.remove': payload => beerCounter.remove(payload, payload.id),
			'admin.rename': payload => beerCounter.rename(payload, payload.id, payload.name),
			'beer.subscribe': () => beerCounter.changes
		})
	})
)
