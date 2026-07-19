from aiogram import Router

from . import calendar, cancel, create_task, employees, leads, link, tasks

router = Router()
router.include_router(link.router)
router.include_router(cancel.router)
router.include_router(create_task.router)
router.include_router(employees.router)
router.include_router(calendar.router)
router.include_router(leads.router)
router.include_router(tasks.router)
