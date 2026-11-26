import { CINE_ROLES } from "./cine-roles";

const assignable = CINE_ROLES.filter(role => role.value !== "viewer");
const departments = [...new Set(assignable.map(role => role.department))];

export default function CinematicRoleOptions() {
  return departments.map(department => (
    <optgroup key={department} label={department}>
      {assignable.filter(role => role.department === department).map(role => (
        <option key={role.value} value={role.value}>{role.label}</option>
      ))}
    </optgroup>
  ));
}
