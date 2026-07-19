from aiogram import Router

from . import create_task, employees, link, tasks

router = Router()
router.include_router(link.router)
router.include_router(create_task.router)
router.include_router(employees.router)
router.include_router(tasks.router)
