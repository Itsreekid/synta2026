// Official @videojs/core 10.6.0 orientation controller; predicate import inlined for no-build use.
const isFunction = value => typeof value === "function";
const isNull = value => value === null;
//#region src/dom/presentation/orientation.ts
function createScreenOrientationLock() {
	/** Type the caller last asked for, or null once released. */
	let desired = null;
	/** Type the platform accepted, or null while no lock is held. */
	let held = null;
	/** Set while a platform request is in flight. */
	let settling = false;
	const releaseOrientation = () => {
		const orientation = globalThis.screen?.orientation;
		const unlock = orientation?.unlock;
		if (!isFunction(unlock)) return;
		try {
			unlock.call(orientation);
		} catch {}
	};
	/**
	* Drives the platform toward `desired`, one request at a time. A re-entrant call returns immediately because the
	* running pass re-reads `desired` before it exits, so the last requested type wins without overlapping requests whose
	* settle order the platform does not guarantee.
	*/
	const reconcile = async () => {
		if (settling) return;
		settling = true;
		try {
			while (desired !== held) {
				const target = desired;
				if (isNull(target)) {
					releaseOrientation();
					held = null;
					continue;
				}
				const orientation = globalThis.screen?.orientation;
				const lock = orientation?.lock;
				if (!isFunction(lock)) return;
				try {
					await lock.call(orientation, target);
				} catch {
					if (desired === target) return;
					continue;
				}
				held = target;
			}
		} finally {
			settling = false;
		}
	};
	return {
		lock(type) {
			desired = type;
			return reconcile();
		},
		unlock() {
			desired = null;
			reconcile();
		}
	};
}
//#endregion
export { createScreenOrientationLock };
