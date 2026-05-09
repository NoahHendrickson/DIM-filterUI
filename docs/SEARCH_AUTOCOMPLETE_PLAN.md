# Plan: Inline ghost-text autocomplete and Tab-cycle for the search bar

This document is a design and implementation plan for upgrading DIM's main
search querying UX so it behaves like a modern, "browser/IDE style" input:

- As the user types a filter keyword, an **inline ghost completion** appears in
  the input itself (e.g. typing `set` shows `set`bonus dimmed at the caret).
  Pressing `Tab` accepts that ghost text and the caret jumps to the next
  meaningful position.
- After accepting the keyword (so the input ends with `keyword:`), the same
  ghost mechanism shows the **first suggested value**. Pressing `Tab` accepts
  it. Pressing `Tab` again **cycles** to the next suggested value, then the
  next, and so on, replacing the previously‑accepted ghost as you go.
- Shift+Tab cycles backwards. Escape (or any other input) cancels the cycle and
  leaves whatever value is currently materialised.

The dropdown panel keeps working exactly as today; ghost text is purely an
addition layered on top of the existing autocompleter.

## 1. Current state

All search input code lives in `src/app/search/`.

- `SearchBar.tsx` is the input component. It uses Downshift's `useCombobox` and
  renders a dropdown of `SearchItem`s.
- `autocomplete.ts` exposes `createAutocompleter` /
  `autocompleteTermSuggestions` / `makeFilterComplete`. These take the live
  query plus caret index and return a sorted list of completion strings.
- `suggestions-generation.ts` + `search-config.ts` enumerate every legal
  `keyword`, `keyword:`, and `keyword:value` token (with `<`, `>`, `<=`, `>=`
  variants) for a given destiny version and language.
- Tab-completion exists today but is "all or nothing": the `Tab` handler
  in `SearchBar.tsx` (`onKeyDown`) replaces the entire input with the
  full text of `tabAutocompleteItem.query.fullText` and moves the caret to the
  end of the highlighted range. There's no inline preview, and pressing `Tab`
  again does not cycle — it just re-accepts the same item.

References to the relevant pieces:

```412:446:src/app/search/SearchBar.tsx
  // Implement tab completion on the tab key. If the highlighted item is an autocomplete suggestion,
  // accept it. Otherwise, we scan from the beginning to find the first autocomplete suggestion and
  // accept that. If there's nothing to accept, the tab key does its normal thing, which is to switch
  // focus. The tabAutocompleteItem is computed as part of render so we can offer keyboard help.
  const tabAutocompleteItem =
    highlightedIndex > 0 && items[highlightedIndex]?.type === SearchItemType.Autocomplete
      ? items[highlightedIndex]
      : items.find((s) => s.type === SearchItemType.Autocomplete && s.query.fullText !== liveQuery);
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && tabAutocompleteItem && isOpen) {
      e.preventDefault();
      if (inputElement.current) {
        // Use execCommand to make the insertion as if the user typed it, so it can be undone with Ctrl-Z
        inputElement.current.setSelectionRange(0, inputElement.current.value.length);
        document.execCommand('insertText', false, tabAutocompleteItem.query.fullText);
        if (tabAutocompleteItem.highlightRange) {
          const cursorPos = tabAutocompleteItem.highlightRange.range[1];
          inputElement.current.setSelectionRange(cursorPos, cursorPos);
        }
      }
    }
```

```302:352:src/app/search/autocomplete.ts
export function autocompleteTermSuggestions<I, FilterCtx, SuggestionsCtx>(
  query: string,
  caretIndex: number,
  filterComplete: (term: string) => string[],
  searchConfig: SearchConfig<I, FilterCtx, SuggestionsCtx>,
): SearchItem[] {
  // ...
  // Find the first index that gives us suggestions and return those suggestions
  for (const index of lastFilters) {
    const base = query.slice(0, index);
    const term = queryUpToCaret.substring(index);
    const candidates = filterComplete(term);
    // ...
  }
  return [];
}
```

So we already produce the right *list* of completions; the gap is in how we
*render and consume* them.

## 2. UX goals

1. **Inline ghost text.** When the caret is at the end of an incomplete filter
   segment and there is a confident completion, render the unfilled tail of
   the suggestion in‑line, dimmed, immediately after the caret. The user sees
   what `Tab` will produce without taking their eyes off the input.
2. **Confident is contextual.** Show the ghost when:
   - the caret is at the end of the current segment (no characters between
     caret and the next whitespace or `)`);
   - the top‑ranked suggestion has the user's current term as a true prefix of
     its completion within that segment (case- and diacritic-insensitive,
     reusing the existing `plainString` logic in `text-utils.ts`).
   Otherwise, suppress the ghost. The dropdown still shows the full list.
3. **Tab acceptance.**
   - First `Tab` while a ghost is visible: materialise the ghost, leave the
     caret at the end of what was just inserted.
   - If the accepted token now ends with `:` (it was just a keyword), do not
     cycle yet — instead immediately recompute completions for the empty value
     and surface a new ghost (the first suggested value).
   - If the accepted token is a complete `keyword:value`, append a single
     trailing space. The ghost disappears until the user types more or hits
     `Tab` to cycle.
4. **Tab cycling on values.**
   - Once the ghost has been accepted at least once *for the current segment*
     and the caret has not moved, subsequent `Tab` presses replace the
     materialised value with the next candidate from the ranked list, wrapping
     at the end. `Shift+Tab` walks backwards.
   - The cycle is bound to the segment's start index. Any of the following
     resets it: typing a non-`Tab` key, moving the caret, blurring the input,
     receiving a new value from props.
5. **Discoverability.** When a ghost is present, render a subtle "Tab"
   key-help marker at the right edge of the input (re-using `KeyHelp`). When
   the user is in cycle mode, render `Tab` + `Shift Tab` together.
6. **No regressions.** All existing accelerators continue to work:
   `Enter` to commit, dropdown arrow navigation, `Shift+Backspace` on recents,
   etc. Mobile/iOS users (where physical Tab does not exist and the dropdown
   is the primary UX) see no change in behaviour by default.

## 3. Non-goals

- We are not redesigning the dropdown panel content or its sort order in this
  pass (a follow-up could use the same ranking work).
- We are not changing the underlying query language or filter definitions.
- We are not adding fuzzy matching for ghost text. Ghost text is strict
  prefix-only against the segment; the dropdown remains permissive.
- We are not changing the loadout search bar's separate codepath beyond what
  falls out of `SearchBar.tsx` working for both.

## 4. Design

### 4.1 Where ghost text is computed

Introduce a new pure helper alongside `autocompleteTermSuggestions`:

```ts
// src/app/search/autocomplete.ts
export interface InlineCompletion {
  /** Completion strings, ranked. First entry is the default ghost. */
  candidates: string[];
  /** The character index in the live query where the current segment starts. */
  segmentStart: number;
  /** The character index where the current segment ends (caret position). */
  segmentEnd: number;
  /** The user-typed prefix within that segment (lowercased + plain-stringed). */
  typedPrefix: string;
}

export function inlineCompletion<I, F, S>(
  query: string,
  caretIndex: number,
  filterComplete: (term: string) => string[],
  searchConfig: SearchConfig<I, F, S>,
): InlineCompletion | undefined;
```

`inlineCompletion` reuses `findLastFilter` (already exported privately) plus
`filterComplete` to find candidates and then keeps **only** those that are
case/diacritic-insensitive *prefix* matches of the current segment. Anything
that isn't a prefix is dropped — those still appear in the dropdown via the
existing `autocompleteTermSuggestions`, but they aren't acceptable ghost
candidates because completing them would have to delete characters the user
already typed.

Special cases we explicitly handle:

- The user has typed `keyword:` with nothing after — `typedPrefix` is the
  empty string. We still produce candidates because every value is a prefix
  match of the empty string. This is what powers value cycling.
- The user typed `keyword:partialvalue` — restrict to candidates whose value
  portion starts with `partialvalue`.
- Multiquery filters (e.g. `perk:foo+bar`) — treat the substring after the
  last `+` as the prefix and offer remaining options in the same family
  (see the existing `multiqueryTermsLookup` block in `makeFilterComplete`).
- Quoted freeform (e.g. `name:"the last w`) — let the lexer emit the raw
  segment (it already does via `QueryLexerError`); ghost text appends the
  remaining characters and the closing quote.

### 4.2 Rendering the ghost

The ghost has to be visually aligned with the caret position inside an
`<input>`. We render a sibling `<span>` absolutely positioned over the input
and use a hidden measurement node (an off-screen `<span>` mirroring the
input's font and the user's text up to the caret) to determine the caret's
horizontal pixel offset. This is the same "shadow input" trick used by
GitHub's mention typeahead; it does not require touching the actual `<input>`
DOM and therefore plays nicely with Downshift, password managers, and IME
input.

Concretely, in `SearchBar.tsx`:

- Add a `GhostOverlay` component that takes `liveQuery`, `caretPosition`,
  `ghostText`. It renders one `<span>` for the measured prefix and another
  for the dimmed remainder. Mount it inside the same wrapper as the
  `<input>`, with `position: relative` on the wrapper.
- New CSS in `SearchBar.m.scss`:
  - `.ghostLayer` — absolute, padding/font matched to the input,
    `pointer-events: none`, `user-select: none`, color
    `var(--theme-text-secondary)` at ~55% opacity, `white-space: pre`.
  - `.ghostMeasure` — visually hidden but laid out, used only to find the X
    coordinate of the caret. Same font and padding as the input.
- Hide the ghost when:
  - `liveQuery` is empty;
  - `!isOpen` (dropdown closed = user dismissed suggestions);
  - input is blurred;
  - the input's `selectionStart !== selectionEnd` (text is selected);
  - `prefers-reduced-motion` is set — we still show the ghost, but skip the
    fade-in transition.

### 4.3 Tab key handling

Replace the existing `Tab` branch of `onKeyDown` with a small state machine
held in a `useRef<TabCycleState | null>(null)`:

```ts
type TabCycleState = {
  segmentStart: number;
  segmentEnd: number;     // end of the originally typed prefix
  typedPrefix: string;
  candidates: string[];
  index: number;          // currently materialised candidate
};
```

Behaviour on `Tab` (`Shift+Tab` decrements):

1. If no `cycleState`:
   - Read the latest `inlineCompletion`. If no candidate, fall through to
     default Tab (focus change). Mark `e.preventDefault()` only if we will
     handle it.
   - Insert `candidates[0]` over the segment using `document.execCommand
     ('insertText', …)` so undo (`Ctrl/⌘+Z`) still works (this is what the
     current code already does).
   - If the inserted text ends with `:` (keyword without value), do **not**
     start a cycle — just recompute `inlineCompletion`; the next `Tab` will
     start a fresh cycle on the value list.
   - Otherwise, store `cycleState` with `index = 0` and `segmentEnd = start +
     candidates[0].length`.
2. If `cycleState` is set and `caretIndex === cycleState.segmentEnd`:
   - `index = (index + dir + candidates.length) % candidates.length`.
   - Replace the segment in place with `candidates[index]`. Keep the caret
     at the new end.
3. Anything that mutates the input other than this Tab handler (typing,
   click, mouse selection, programmatic `setInputValue`, blur) clears
   `cycleState` via the existing `onInputValueChange`.

This is implemented entirely in `SearchBar.tsx`; `autocomplete.ts` only gains
the new pure helper.

### 4.4 Ranking changes for cycling

`makeFilterComplete` already produces a sensible order for keyword
completion. For *value* cycling we want:

1. Exact prefix match of what the user typed, alphabetically.
2. Then the existing tag/no-not/no-`>=` ordering.
3. Suggestions list deduplicated against the literal text the user has
   already typed (already done at the bottom of `makeFilterComplete`).

We will introduce a small wrapper used only by `inlineCompletion` that
filters the existing sorted suggestions down to those whose *segment portion*
is a strict prefix match. We do **not** change the dropdown ordering. This
keeps the change surgical and unit-testable.

### 4.5 Accessibility

- Ghost text is purely visual. Add `aria-autocomplete="inline"` on the input
  alongside the existing combobox attributes from Downshift (Downshift sets
  `list`; both are valid simultaneously).
- Update the `<input>` `aria-describedby` to include a visually-hidden
  element that announces the active ghost only when it changes (debounced
  ~300ms, polite). Without this, keyboard-only users have no way to know a
  Tab is meaningful.
- Keep the existing `KeyHelp` "Tab" badge in the dropdown row; add an inline
  `KeyHelp` to the right of the input when a ghost is showing. While in
  cycle mode also show `Shift Tab` and a small "n / m" indicator.

### 4.6 Mobile

On phone-portrait and iOS browsers we currently auto-suppress focus-on-load
and the Tab key isn't available. Behaviour:

- The ghost still renders if there is enough horizontal space (it never
  pushes layout because it's absolutely positioned).
- The dropdown items remain tap-to-accept. We add a tap target to the ghost
  itself (`pointer-events: auto` only when `isPhonePortrait`) so a user can
  tap the dimmed text to accept it. This is opt-in — without that, mobile
  UX is unchanged.

## 5. Implementation steps

Each bullet is an isolated commit with tests where applicable.

1. **Extract `findLastFilter` and segment parsing.** Move
   `findLastFilter` and the caret-snapping logic in
   `autocompleteTermSuggestions` into a small, exported helper
   `findCurrentSegment(query, caretIndex)`. No behaviour change. Add unit
   tests covering nested parens, multiquery `+`, unterminated quotes.

2. **Add `inlineCompletion` helper.** New function in `autocomplete.ts`
   returning `InlineCompletion | undefined`. Pure, easy to unit-test.
   Add `autocomplete.test.ts` cases mirroring the existing ones plus
   value-cycling cases like:
   ```
   ['set',          ['setbonus:']],
   ['setbonus:',    ['setbonus:<first slug>', 'setbonus:<second>', …]],
   ['setbonus:te',  ['setbonus:tex...', …]],
   ['name:"arctic ', ['name:"arctic haze"', …]],
   ['perk:foo+',    ['perk:foo+<next>', …]],
   ```

3. **Render the ghost.** Add `GhostOverlay` and CSS. Wire it up in
   `SearchBar.tsx` reading `inlineCompletion(liveQuery, caretPosition, …)`.
   Behind a feature flag (`$featureFlags.inlineSearchGhost`, default `true`
   in dev) for the first iteration so we can ship dark.

4. **Tab state machine.** Replace the existing `Tab` branch in `onKeyDown`
   with the `TabCycleState` logic above. Wire `Shift+Tab`. Reset
   `cycleState` from `onInputValueChange` when the change came from anything
   other than the Tab handler (Downshift exposes a `type` discriminator).

5. **Accessibility polish.** Add `aria-autocomplete`, the live region, and
   the inline `KeyHelp`s.

6. **Mobile tap-to-accept.** Add `pointer-events: auto` on phone-portrait
   and a click handler that delegates to the same accept path used by Tab.

7. **Tests.**
   - Unit tests in `autocomplete.test.ts` for `inlineCompletion` and for the
     prefix-only filter ranking.
   - A React Testing Library test in a new `SearchBar.test.tsx` covering:
     "type s-e-t, see ghost = setbonus, press Tab, see `setbonus:`, ghost is
     first slug, press Tab to accept, press Tab again to cycle to next slug,
     press Shift+Tab to go back".
   - Snapshot test confirming Downshift dropdown content is unchanged for
     the same queries.

8. **Performance.** Memoise `inlineCompletion` keyed on
   `(liveQuery, caretPosition, searchConfig)` (its inputs are already
   memoised at the parent). The width-measurement span only re-measures when
   `liveQuery.slice(0, caretIndex)` changes. We expect zero impact on the
   typing path because we reuse the already-cached `items` array — the new
   helper does the same work the dropdown does and is gated behind the same
   memo.

9. **Telemetry/feedback hook (optional).** Count Tab acceptances vs.
   dropdown clicks via the existing `searchUsed` action so we can validate
   the change post-rollout. Strictly opt-in.

## 6. Risks and open questions

- **Ghost text alignment** is the most fragile part. The shadow-span trick
  works in every modern browser DIM supports, but font kerning and Safari's
  `text-rendering` handling can cause sub-pixel drift. We will lock the
  input + overlay to the same `font-family/size/letter-spacing/padding`
  variables and add a visual regression test (Playwright screenshot) on a
  small set of representative queries.
- **Tab focus escape.** Some users rely on Tab to leave the input. We
  preserve this by only swallowing Tab when there is an active ghost; when
  there is none, default behaviour is unchanged.
- **Conflicts with Downshift's own keyboard handling.** Downshift consumes
  Home/End and arrow keys; we already work around Home/End. We need to
  ensure our Tab handler runs before Downshift's by using
  `preventDownshiftDefault` (the same escape hatch already used in
  `onKeyDown`).
- **IME composition.** Suspend the ghost while
  `event.isComposing || keyCode === 229` is true; resume on `compositionend`.
- **Selected text.** If the user has selected a range inside the input,
  pressing Tab should not cycle — let the browser handle indent or
  fall-through.
- **i18n.** Suggestions can include non-ASCII characters (e.g. `jötunn`).
  The existing `plainString` normalisation already covers prefix matching;
  the ghost rendering uses the raw `rawText`, not the normalised form, so
  the user sees the diacritics they expect.

## 7. Out-of-scope follow-ups

- Apply the same ghost mechanism to the loadout edit query box (`searchType
  === SearchType.Loadout`) — should be a one-line wire-up since both already
  share `SearchBar.tsx`.
- A "value picker" panel attached to the dropdown for filters with closed
  enumerations (tag, season, element).
- Recording recently-used values per filter so the cycle order is
  personalised (e.g. always show `tag:keep` first if the user uses it most).

---

**Estimated scope:** small, contained surface area. New code in
`src/app/search/autocomplete.ts` (new helper + tests), `src/app/search/
SearchBar.tsx` (overlay + key handler), and `src/app/search/
SearchBar.m.scss` (overlay styles). No filter definitions or query-parser
changes required.
