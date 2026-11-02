import type { ComponentType } from 'react'
import Home from './Home'
import Store from './Store'
import Library from './Library'
import Downloads from './Downloads'
import Network from './Network'
import GameDetail from './GameDetail'
import type { PageId } from '../state/launcher'

export const pages: Record<PageId, ComponentType> = {
  home: Home,
  store: Store,
  library: Library,
  downloads: Downloads,
  network: Network,
  game: GameDetail,
}
