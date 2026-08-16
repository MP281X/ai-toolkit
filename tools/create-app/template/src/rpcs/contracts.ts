import {Schema} from 'effect'

import {Rpc, RpcGroup} from 'effect/unstable/rpc'

export class RpcContracts extends RpcGroup.make(Rpc.make('app.name', {success: Schema.String})) {}
