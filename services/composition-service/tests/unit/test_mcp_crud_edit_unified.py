"""S3 CRUD families — dispatch tests for the 5 unified op-tools (structure_template,
outline_node, canon_rule, entity_override, scene_link). Proves op-routing + arg
construction + validation; delegates patched so a mis-route reds. Underlying handlers keep
their own EFFECT tests.
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch

import app.mcp.server as srv

PROJ = "44444444-4444-4444-4444-444444444444"
NODE = "55555555-5555-5555-5555-555555555555"
TID = "66666666-6666-6666-6666-666666666666"
RID = "77777777-7777-7777-7777-777777777777"
EID = "88888888-8888-8888-8888-888888888888"
LID = "99999999-9999-9999-9999-999999999999"


class _Ctx:
    def __init__(self):
        self.user_id = None
        self.session_id = "s"
        self.project_id = None
        self.trace_id = None
        self.internal_token = "t"


# ── structure_template ────────────────────────────────────────────────────────


async def test_struct_template_create_keeps_default_kind():
    with patch.object(srv, "composition_structure_template_create", AsyncMock(return_value={"id": TID})) as m:
        await srv.composition_structure_template_edit(
            _Ctx(), srv._StructTemplateEditArgs(op="create", name="Three-Act"))
    passed = m.await_args.args[1]
    assert isinstance(passed, srv._StructTemplateCreateArgs)
    assert passed.name == "Three-Act" and passed.kind == "generic"  # _present kept default


async def test_struct_template_clone_routes_not_archive():
    with patch.object(srv, "composition_structure_template_clone", AsyncMock(return_value={"id": TID})) as c, \
         patch.object(srv, "composition_structure_template_archive", AsyncMock()) as a:
        await srv.composition_structure_template_edit(
            _Ctx(), srv._StructTemplateEditArgs(op="clone", template_id=TID, name="copy"))
    c.assert_awaited_once()
    a.assert_not_awaited()


async def test_struct_template_update_requires_version():
    with pytest.raises(ValueError, match="expected_version"):
        await srv.composition_structure_template_edit(
            _Ctx(), srv._StructTemplateEditArgs(op="update", template_id=TID))


async def test_struct_template_restore_routes():
    with patch.object(srv, "composition_structure_template_restore", AsyncMock(return_value={"ok": 1})) as m:
        await srv.composition_structure_template_edit(
            _Ctx(), srv._StructTemplateEditArgs(op="restore", template_id=TID))
    assert m.await_args.args[1].template_id == TID


# ── outline_node ──────────────────────────────────────────────────────────────


async def test_outline_create_keeps_status_default():
    with patch.object(srv, "composition_outline_node_create", AsyncMock(return_value={"id": NODE})) as m:
        await srv.composition_outline_node_edit(
            _Ctx(), srv._OutlineNodeEditArgs(op="create", kind="scene", project_id=PROJ, title="S1"))
    passed = m.await_args.args[1]
    assert isinstance(passed, srv._NodeCreateArgs)
    assert passed.kind == "scene" and passed.status == "empty" and passed.title == "S1"


async def test_outline_delete_routes_not_restore():
    with patch.object(srv, "composition_outline_node_delete", AsyncMock(return_value={"archived": True})) as d, \
         patch.object(srv, "composition_outline_node_restore", AsyncMock()) as r:
        await srv.composition_outline_node_edit(
            _Ctx(), srv._OutlineNodeEditArgs(op="delete", project_id=PROJ, node_id=NODE))
    d.assert_awaited_once()
    r.assert_not_awaited()
    assert d.await_args.kwargs == {"project_id": PROJ, "node_id": NODE}


async def test_outline_move_routes():
    with patch.object(srv, "composition_outline_node_move", AsyncMock(return_value={"ok": 1})) as m:
        await srv.composition_outline_node_edit(
            _Ctx(), srv._OutlineNodeEditArgs(op="move", project_id=PROJ, node_id=NODE, after_id=TID))
    passed = m.await_args.args[1]
    assert isinstance(passed, srv._OutlineNodeMoveArgs)
    assert passed.after_id == TID and passed.node_id == NODE


async def test_outline_update_requires_version():
    with pytest.raises(ValueError, match="expected_version"):
        await srv.composition_outline_node_edit(
            _Ctx(), srv._OutlineNodeEditArgs(op="update", project_id=PROJ, node_id=NODE))


# ── canon_rule ────────────────────────────────────────────────────────────────


async def test_canon_create_keeps_scope_default():
    with patch.object(srv, "composition_canon_rule_create", AsyncMock(return_value={"id": RID})) as m:
        await srv.composition_canon_rule_edit(
            _Ctx(), srv._CanonRuleEditArgs(op="create", project_id=PROJ, text="No magic on Tuesdays"))
    passed = m.await_args.args[1]
    assert isinstance(passed, srv._CanonRuleCreateArgs)
    assert passed.scope == "world" and passed.text == "No magic on Tuesdays"


async def test_canon_delete_routes_not_restore():
    with patch.object(srv, "composition_canon_rule_delete", AsyncMock(return_value={"deleted": True})) as d, \
         patch.object(srv, "composition_canon_rule_restore", AsyncMock()) as r:
        await srv.composition_canon_rule_edit(
            _Ctx(), srv._CanonRuleEditArgs(op="delete", project_id=PROJ, rule_id=RID))
    d.assert_awaited_once()
    r.assert_not_awaited()


async def test_canon_create_requires_text():
    with pytest.raises(ValueError, match="text"):
        await srv.composition_canon_rule_edit(
            _Ctx(), srv._CanonRuleEditArgs(op="create", project_id=PROJ))


# ── entity_override ───────────────────────────────────────────────────────────


async def test_entity_override_add_routes():
    with patch.object(srv, "composition_entity_override_add", AsyncMock(return_value={"id": EID})) as m:
        await srv.composition_entity_override_edit(
            _Ctx(), srv._EntityOverrideEditArgs(op="add", project_id=PROJ, target_entity_id=EID,
                                                overridden_fields={"name": "X"}))
    passed = m.await_args.args[1]
    assert isinstance(passed, srv._EntityOverrideAddArgs)
    assert passed.target_entity_id == EID and passed.overridden_fields == {"name": "X"}


async def test_entity_override_delete_routes_not_update():
    with patch.object(srv, "composition_entity_override_delete", AsyncMock(return_value={"deleted": True})) as d, \
         patch.object(srv, "composition_entity_override_update", AsyncMock()) as u:
        await srv.composition_entity_override_edit(
            _Ctx(), srv._EntityOverrideEditArgs(op="delete", project_id=PROJ, override_id=EID))
    d.assert_awaited_once()
    u.assert_not_awaited()


async def test_entity_override_add_requires_target():
    with pytest.raises(ValueError, match="target_entity_id"):
        await srv.composition_entity_override_edit(
            _Ctx(), srv._EntityOverrideEditArgs(op="add", project_id=PROJ))


# ── scene_link ────────────────────────────────────────────────────────────────


async def test_scene_link_create_keeps_kind_default():
    with patch.object(srv, "composition_scene_link_create", AsyncMock(return_value={"id": LID})) as m:
        await srv.composition_scene_link_edit(
            _Ctx(), srv._SceneLinkEditArgs(op="create", project_id=PROJ, from_node_id=NODE, to_node_id=TID))
    passed = m.await_args.args[1]
    assert isinstance(passed, srv._SceneLinkCreateArgs)
    assert passed.kind == "setup_payoff" and passed.from_node_id == NODE


async def test_scene_link_delete_routes_not_create():
    with patch.object(srv, "composition_scene_link_delete", AsyncMock(return_value={"deleted": True})) as d, \
         patch.object(srv, "composition_scene_link_create", AsyncMock()) as c:
        await srv.composition_scene_link_edit(
            _Ctx(), srv._SceneLinkEditArgs(op="delete", project_id=PROJ, link_id=LID))
    d.assert_awaited_once()
    c.assert_not_awaited()
    assert d.await_args.kwargs == {"project_id": PROJ, "link_id": LID}


async def test_scene_link_create_requires_endpoints():
    with pytest.raises(ValueError, match="from_node_id"):
        await srv.composition_scene_link_edit(
            _Ctx(), srv._SceneLinkEditArgs(op="create", project_id=PROJ))
