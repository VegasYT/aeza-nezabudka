from typing import Annotated
from uuid import UUID

from pydantic import ConfigDict, Field, StringConstraints

from core.schemas import ApiModel, InputModel

DepartmentName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=100),
    Field(examples=["Офис"]),
]


class Department(ApiModel):
    id: UUID = Field(examples=["9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"])
    name: DepartmentName
    payments_count: int = Field(ge=0, description="Сколько действующих платежей", examples=[2])


class DepartmentRef(ApiModel):
    """Отдел внутри других ответов."""

    id: UUID = Field(examples=["9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"])
    name: str = Field(examples=["Офис"])


class DepartmentWrite(InputModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"name": "Офис"}]})

    name: DepartmentName
