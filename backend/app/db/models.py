"""
Tüm SQLAlchemy modellerini tek yerden yükler.
Alembic (autogenerate) ve migrate.py, Base.metadata'nın eksiksiz olması için bunu import eder.
Yeni bir modül eklediğinizde modelini buraya da ekleyin.
"""
from app.core.base import Base  # noqa: F401

from app.modules.projects     import models as project_models      # noqa: F401
from app.modules.users        import models as user_models         # noqa: F401
from app.modules.test_cases   import models as test_case_models    # noqa: F401
from app.modules.test_plans   import models as test_plan_models    # noqa: F401
from app.modules.test_runs    import models as test_run_models     # noqa: F401
from app.modules.environments import models as env_models          # noqa: F401
from app.modules.roles        import models as role_models         # noqa: F401
from app.modules.integrations import models as int_models          # noqa: F401
from app.modules.defects      import models as defect_models       # noqa: F401
