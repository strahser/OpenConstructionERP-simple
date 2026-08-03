# DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
# Copyright (c) 2026 Artem Boiko / DataDrivenConstruction
# OpenConstructionERP - DataDrivenConstruction (DDC)
# Copyright (c) 2026 Artem Boiko / DataDrivenConstruction
# AGPL-3.0 License
"""Reusable per-module demo enrichment.

The rich per-module demo seeders (photos, takeoff, BIM grouping, clash,
carbon, QMS, advanced scheduling, cost model, MoC, supplier catalogs,
variations, accommodation, markups, catalog, plus CRM / service / bid /
HSE / portal / tendering) used to run only inline at first boot in
``app/main.py``. The in-app partner-pack apply paths installed the demo
project's BOQ / budget / schedule / tender / BIM model / PDFs but never ran
these enrichment seeders, so a pack applied from the Modules page after boot
opened with empty photos / takeoff / clash / carbon / qms / variations /
costmodel / moc / markups / catalog.

This module extracts that seeder list into one reusable, fail-soft coroutine
so both boot AND the pack-apply paths run the exact same enrichment. Each
seeder runs in its own DB session inside its own ``try/except`` so a single
seeder (or a single project) failing never aborts the rest, never aborts the
pack apply and never aborts boot.

Simplified build: modules removed from the distribution are skipped
individually at import time; the seeders that remain (bim_hub, clash, photos,
markups, schedule_advanced, takeoff) still run.

No new DB tables: this only orchestrates seeders that already exist.
"""

from __future__ import annotations

import logging
import uuid

logger = logging.getLogger(__name__)

# The flagship reference project. Kept first in the enrichment order so the
# seeders that cap at a few projects (advanced scheduling, QMS, supplier
# catalog) always cover the project users land on.
_FLAGSHIP_ID = uuid.UUID("f1a95000-0001-4a00-8b00-000000000001")


def _try_import(module: str, attr: str):
    """Import ``attr`` from ``module`` or return None when the module was
    removed in the simplified build."""
    try:
        mod = __import__(module, fromlist=[attr])
        return getattr(mod, attr, None)
    except ImportError:
        logger.debug("module %s removed in simplified build; seeder skipped.", module)
        return None


async def enrich_projects(project_ids: list[uuid.UUID]) -> None:
    """Run every per-module demo seeder across the given projects.

    Mirrors the first-boot enrichment block that used to live inline in
    ``app/main.py`` (the unconditional ``OE_TEST_FAST_STARTUP``-gated block).
    Each seeder runs in its own session and its own ``try/except`` so one
    failing seeder (or one failing project) can never abort the rest. Safe to
    call repeatedly: every seeder is either internally idempotent or gated on a
    marker table so a re-run never duplicates rows.

    Args:
        project_ids: The projects to enrich. Typically every project at boot,
            or the single project a partner-pack apply just installed.
    """
    if not project_ids:
        return

    try:
        from sqlalchemy import func as _func
        from sqlalchemy import select as _msel

        from app.database import async_session_factory

        # ── Individual (fail-soft) imports ────────────────────────────────
        # Modules kept in the simplified build.
        seed_bim_hub = _try_import("app.modules.bim_hub.seed", "seed_bim_hub")
        seed_clash = _try_import("app.modules.clash.seed", "seed_clash")
        seed_photos = _try_import("app.modules.documents.photos_seed", "seed_photos")
        seed_markups = _try_import("app.modules.markups.seed", "seed_markups")
        seed_schedule_advanced_demo = _try_import(
            "app.modules.schedule_advanced.seed", "seed_schedule_advanced_demo"
        )
        MasterSchedule = _try_import("app.modules.schedule_advanced.models", "MasterSchedule")
        seed_takeoff_demo = _try_import("app.modules.takeoff.seed", "seed_takeoff_demo")

        # Modules removed in the simplified build (None when absent).
        seed_accommodation = _try_import("app.modules.accommodation.seed", "seed_accommodation")
        seed_bid_management_demo = _try_import(
            "app.modules.bid_management.seed", "seed_bid_management_demo"
        )
        CarbonInventory = _try_import("app.modules.carbon.models", "CarbonInventory")
        seed_carbon_demo = _try_import("app.modules.carbon.seed", "seed_carbon_demo")
        seed_catalog = _try_import("app.modules.catalog.seed", "seed_catalog")
        seed_costmodel = _try_import("app.modules.costmodel.seed", "seed_costmodel")
        seed_crm_demo = _try_import("app.modules.crm.seed", "seed_crm_demo")
        seed_hse_advanced_demo = _try_import(
            "app.modules.hse_advanced.seed", "seed_hse_advanced_demo"
        )
        seed_moc = _try_import("app.modules.moc.seed", "seed_moc")
        seed_portal_demo = _try_import("app.modules.portal.seed", "seed_portal_demo")
        ITPPlan = _try_import("app.modules.qms.models", "ITPPlan")
        seed_qms = _try_import("app.modules.qms.seed", "seed_qms")
        seed_service_demo = _try_import("app.modules.service.seed", "seed_service_demo")
        seed_supplier_catalogs = _try_import(
            "app.modules.supplier_catalogs.seed", "seed_supplier_catalogs"
        )
        seed_tendering = _try_import("app.modules.tendering.seed", "seed_tendering")
        Notice = _try_import("app.modules.variations.models", "Notice")
        seed_variations_demo = _try_import("app.modules.variations.seed", "seed_variations_demo")

        # Keep the flagship reference project first so seeders that cap at a
        # few projects (advanced scheduling, QMS, supplier catalog) always
        # cover the project users land on.
        _all_pids = list(project_ids)
        _all_pids.sort(key=lambda _p: 0 if _p == _FLAGSHIP_ID else 1)
        _first_pid = _all_pids[0] if _all_pids else None

        # (name, marker model gating a restart-safe skip, coroutine builder).
        # A None marker means the seeder self-guards against duplicates.
        # Entries whose import failed (None seeder) are dropped silently.
        _module_seeders = []
        if seed_crm_demo:
            _module_seeders.append(("crm", None, lambda s: seed_crm_demo(s)))
        if seed_service_demo:
            _module_seeders.append(("service", None, lambda s: seed_service_demo(s)))
        if seed_bid_management_demo:
            _module_seeders.append(
                ("bid_management", None, lambda s: seed_bid_management_demo(s, _all_pids))
            )
        if seed_hse_advanced_demo:
            _module_seeders.append(
                ("hse_advanced", None, lambda s: seed_hse_advanced_demo(s, _all_pids))
            )
        if seed_portal_demo:
            _module_seeders.append(("portal", None, lambda s: seed_portal_demo(s, _all_pids)))
        if seed_supplier_catalogs:
            _module_seeders.append(
                ("supplier_catalogs", None, lambda s: seed_supplier_catalogs(s, _first_pid))
            )
        if seed_carbon_demo and CarbonInventory:
            _module_seeders.append(
                ("carbon", CarbonInventory, lambda s: seed_carbon_demo(s, _all_pids))
            )
        if seed_schedule_advanced_demo and MasterSchedule:
            _module_seeders.append(
                (
                    "schedule_advanced",
                    MasterSchedule,
                    lambda s: seed_schedule_advanced_demo(s, _all_pids),
                )
            )
        if seed_variations_demo and Notice:
            _module_seeders.append(
                ("variations", Notice, lambda s: seed_variations_demo(s, _all_pids))
            )
        # ── Modules that shipped without any startup seeder at all ──
        # Each new seeder below is internally idempotent (it returns an
        # empty dict once its own marker rows already exist), so they are
        # wired with a None marker and re-checked cheaply on every restart.
        # A None marker is required here rather than a global row-count gate
        # because several of these (takeoff, tendering, markups)
        # legitimately share their table with rows seeded elsewhere or by
        # users, so a table-wide count would skip the projects that are
        # still empty.
        if seed_costmodel:
            _module_seeders.append(("costmodel", None, lambda s: seed_costmodel(s, _all_pids)))
        if seed_moc:
            _module_seeders.append(("moc", None, lambda s: seed_moc(s, _all_pids)))
        if seed_tendering:
            _module_seeders.append(("tendering", None, lambda s: seed_tendering(s, _all_pids)))
        if seed_takeoff_demo:
            _module_seeders.append(("takeoff", None, lambda s: seed_takeoff_demo(s, _all_pids)))
        if seed_accommodation:
            _module_seeders.append(
                ("accommodation", None, lambda s: seed_accommodation(s, _all_pids))
            )
        if seed_markups:
            _module_seeders.append(("markups", None, lambda s: seed_markups(s, _all_pids)))
        if seed_catalog:
            _module_seeders.append(("catalog", None, lambda s: seed_catalog(s, _all_pids)))
        # Site photos drop real JPEGs into the gallery so the Photos module
        # and the dashboard "latest photos" widget are never empty on a
        # fresh install. Self-guards per project on an existing seeded photo.
        if seed_photos:
            _module_seeders.append(("photos", None, lambda s: seed_photos(s, _all_pids)))
        # bim_hub groups the BIM models that already exist for a project, so
        # it runs near the end (after every other seeder). clash runs right
        # after it so its clash results reference the freshly grouped
        # models; clash also feeds the coordination_hub dashboard's clash
        # rollup.
        if seed_bim_hub:
            _module_seeders.append(("bim_hub", None, lambda s: seed_bim_hub(s, _all_pids)))
        if seed_clash:
            _module_seeders.append(("clash", None, lambda s: seed_clash(s, _all_pids)))

        for _name, _marker, _build in _module_seeders:
            try:
                if _marker is not None:
                    async with async_session_factory() as _chk:
                        _n = (await _chk.execute(_msel(_func.count()).select_from(_marker))).scalar_one()
                    if _n:
                        continue
                async with async_session_factory() as _ms:
                    _counts = await _build(_ms)
                    await _ms.commit()
                    if isinstance(_counts, dict) and any(_counts.values()):
                        logger.info("%s demo seed: %s", _name, _counts)
            except Exception:
                logger.warning("%s demo seed skipped (non-fatal)", _name, exc_info=True)

        # QMS seeds one project at a time and is not internally idempotent; loop
        # the projects, skipping any that already carry an ITP plan so a re-run
        # never duplicates.
        if seed_qms and ITPPlan:
            for _pid in _all_pids:
                try:
                    async with async_session_factory() as _qs:
                        _has = (
                            await _qs.execute(_msel(ITPPlan.id).where(ITPPlan.project_id == _pid).limit(1))
                        ).scalar_one_or_none()
                        if _has is None:
                            await seed_qms(_qs, project_id=_pid)
                            await _qs.commit()
                except Exception:
                    logger.warning("qms demo seed skipped for %s (non-fatal)", _pid, exc_info=True)
    except Exception:
        logger.warning("Feature-module demo seeds skipped (non-fatal)", exc_info=True)


async def enrich_all() -> None:
    """Enrich every project currently in the database.

    Convenience wrapper used at first boot: query all project ids and hand
    them to :func:`enrich_projects`.
    """
    try:
        from sqlalchemy import select as _sel

        from app.database import async_session_factory
        from app.modules.projects.models import Project

        async with async_session_factory() as _s:
            _rows = (await _s.execute(_sel(Project.id))).scalars().all()
        if _rows:
            await enrich_projects(list(_rows))
    except Exception:
        logger.warning("Demo enrichment (all projects) skipped (non-fatal)", exc_info=True)

