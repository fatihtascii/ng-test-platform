import re
from sqlalchemy.orm import Session
from fastapi import HTTPException
from . import models, schemas
from app.modules.projects.models import Project  # Proje kontrolü için

def create_test_case(db: Session, test_case: schemas.TestCaseCreate):
    if not test_case.title.strip():
        raise HTTPException(status_code=400, detail="Test başlığı boş olamaz.")
    
    # Proje var mı kontrolü
    if not db.query(Project).filter(Project.id == test_case.project_id).first():
        raise HTTPException(status_code=404, detail="Bağlı proje bulunamadı.")
        
    db_tc = models.TestCase(**test_case.model_dump())
    db.add(db_tc)
    db.commit()
    db.refresh(db_tc)
    return db_tc

def get_test_cases(db: Session):
    return db.query(models.TestCase).all()

def update_test_case(db: Session, tc_id: int, data: schemas.TestCaseCreate):
    if not data.title.strip():
        raise HTTPException(status_code=400, detail="Test başlığı boş olamaz.")
        
    tc = db.query(models.TestCase).filter(models.TestCase.id == tc_id).first()
    if not tc:
        raise HTTPException(status_code=404, detail="Test case bulunamadı.")
        
    for k, v in data.model_dump().items():
        setattr(tc, k, v)
    db.commit()
    db.refresh(tc)
    return tc

def delete_test_case(db: Session, tc_id: int):
    tc = db.query(models.TestCase).filter(models.TestCase.id == tc_id).first()
    if not tc:
        raise HTTPException(status_code=404, detail="Test case bulunamadı.")
    db.delete(tc)
    db.commit()
    return {"message": "Test case silindi."}

def generate_bdd_code(gherkin_text: str):
    if not gherkin_text.strip():
        raise HTTPException(status_code=400, detail="Gherkin senaryosu boş olamaz.")

    lines = [l.strip() for l in gherkin_text.strip().splitlines() if l.strip()]

    feature_name = "Senaryo"
    scenario_name = "Test Senaryosu"
    given_steps, when_steps, then_steps = [], [], []

    current_keyword = None
    for line in lines:
        lower = line.lower()
        if lower.startswith("feature:"):
            feature_name = line.split(":", 1)[1].strip()
        elif lower.startswith("scenario:") or lower.startswith("scenario outline:"):
            scenario_name = line.split(":", 1)[1].strip()
        elif lower.startswith("given "):
            current_keyword = "given"
            given_steps.append(line[6:].strip())
        elif lower.startswith("when "):
            current_keyword = "when"
            when_steps.append(line[5:].strip())
        elif lower.startswith("then "):
            current_keyword = "then"
            then_steps.append(line[5:].strip())
        elif lower.startswith("and ") or lower.startswith("but "):
            step_text = line[4:].strip()
            if current_keyword == "given":   given_steps.append(step_text)
            elif current_keyword == "when":  when_steps.append(step_text)
            elif current_keyword == "then":  then_steps.append(step_text)

    def to_func_name(text: str) -> str:
        return re.sub(r"[^a-z0-9]+", "_", text.lower())[:50].strip("_")

    def to_step_defs(steps, decorator) -> str:
        result = []
        for s in steps:
            func = to_func_name(s)
            result.append(f'@{decorator}("{s}")')
            result.append(f"def step_{func}():")
            result.append(f'    pass  # TODO: implement')
            result.append("")
        return "\n".join(result)

    feature_file = f'''# {to_func_name(feature_name)}.feature\nFeature: {feature_name}\n\n  Scenario: {scenario_name}\n{chr(10).join("    " + l for l in lines if not l.lower().startswith("feature:"))}\n'''

    step_defs = f'''# steps/test_{to_func_name(scenario_name)}.py\nimport pytest\nfrom pytest_bdd import scenario, given, when, then\n\n@scenario("{to_func_name(feature_name)}.feature", "{scenario_name}")\ndef test_{to_func_name(scenario_name)}():\n    pass\n\n{to_step_defs(given_steps, "given")}\n{to_step_defs(when_steps, "when")}\n{to_step_defs(then_steps, "then")}'''

    return {"code": f"# === FEATURE FILE ===\n{feature_file}\n\n# === STEP DEFINITIONS ===\n{step_defs}"}