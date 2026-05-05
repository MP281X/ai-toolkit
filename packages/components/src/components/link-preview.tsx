import {Array, Match, Option, pipe, String} from 'effect'

import {cn} from '#lib/utils.ts'

export function Favicon(props: {url: string}) {
	return (
		<img
			src={`https://www.google.com/s2/favicons?domain=${new URL(props.url).hostname}&sz=32`}
			alt=""
			className="size-4 shrink-0"
		/>
	)
}

export function LinkPreview(props: {url: URL; className?: string}) {
	return pipe(
		Match.value(String.replace('www.', '')(props.url.hostname)),
		Match.when(Match.is('youtube.com', 'youtu.be'), () => {
			const youtubeId = props.url.searchParams.get('v')
			if (youtubeId) {
				return (
					<iframe
						src={`https://www.youtube.com/embed/${youtubeId}`}
						title="YouTube video"
						className={cn('aspect-video w-full border-0', props.className)}
						allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
						allowFullScreen
					/>
				)
			}

			const shortsId = pipe(
				props.url.pathname,
				String.match(RegExp('/shorts/([^/?]+)')),
				Option.flatMap(Array.get(1)),
				Option.getOrUndefined
			)

			return (
				shortsId && (
					<iframe
						src={`https://www.youtube.com/embed/${shortsId}`}
						title="YouTube video"
						className={cn('aspect-video w-full border-0', props.className)}
						allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
						allowFullScreen
					/>
				)
			)
		}),
		Match.when(Match.is('x.com', 'twitter.com'), () => {
			const tweetId = pipe(
				props.url.pathname,
				String.match(RegExp('/status/(\\d+)')),
				Option.flatMap(Array.get(1)),
				Option.getOrUndefined
			)

			return (
				tweetId && (
					<iframe
						src={`https://platform.twitter.com/embed/Tweet.html?dnt=true&id=${tweetId}`}
						title="X post"
						className={cn('h-100 w-full border-0', props.className)}
					/>
				)
			)
		}),
		Match.when('tiktok.com', () => {
			const tiktokId = pipe(
				props.url.pathname,
				String.match(RegExp('/video/(\\d+)')),
				Option.flatMap(Array.get(1)),
				Option.getOrUndefined
			)

			return (
				tiktokId && (
					<iframe
						src={`https://www.tiktok.com/embed/v2/${tiktokId}`}
						title="TikTok video"
						className={cn('h-175 w-full border-0', props.className)}
					/>
				)
			)
		}),
		Match.orElse(() => undefined)
	)
}
