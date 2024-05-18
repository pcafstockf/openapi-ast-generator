import {getParameterSerializationOptions} from '../../../lang-neutral/parameter-parameter';
import {stringifyRequestParameter} from './client-utils';

describe('StringifyParameter', () => {
	const originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
	beforeAll(() => {
		jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;
	});
	afterAll(() => {
		jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
	});
	it(`should serialize 'simple' styles`, () => {
		const name = 'id';
		let s = getParameterSerializationOptions('simple', false, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, 5)).toEqual('5');
		s = getParameterSerializationOptions('simple', true, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, 5)).toEqual('5');
		s = getParameterSerializationOptions('simple', false, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, [3, 4, 5])).toEqual('3,4,5');
		s = getParameterSerializationOptions('simple', true, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, [3, 4, 5])).toEqual('3,4,5');
		s = getParameterSerializationOptions('simple', false, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, {'role': 'admin', 'firstName': 'Alex'})).toEqual('role,admin,firstName,Alex');
		s = getParameterSerializationOptions('simple', true, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, {'role': 'admin', 'firstName': 'Alex'})).toEqual('role=admin,firstName=Alex');
	});
	it(`should serialize 'label' styles`, () => {
		const name = 'id';
		let s = getParameterSerializationOptions('label', false, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, 5)).toEqual('.5');
		s = getParameterSerializationOptions('label', true, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, 5)).toEqual('.5');
		s = getParameterSerializationOptions('label', false, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, [3, 4, 5])).toEqual('.3,4,5');
		s = getParameterSerializationOptions('label', true, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, [3, 4, 5])).toEqual('.3.4.5');
		s = getParameterSerializationOptions('label', false, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, {'role': 'admin', 'firstName': 'Alex'})).toEqual('.role,admin,firstName,Alex');
		s = getParameterSerializationOptions('label', true, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, {'role': 'admin', 'firstName': 'Alex'})).toEqual('.role=admin.firstName=Alex');
	});
	it(`should serialize 'matrix' styles`, () => {
		const name = 'id';
		let s = getParameterSerializationOptions('matrix', false, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, 5)).toEqual(';id=5');
		s = getParameterSerializationOptions('matrix', true, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, 5)).toEqual(';id=5');
		s = getParameterSerializationOptions('matrix', false, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, [3, 4, 5])).toEqual(';id=3,4,5');
		s = getParameterSerializationOptions('matrix', true, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, [3, 4, 5])).toEqual(';id=3;id=4;id=5');
		s = getParameterSerializationOptions('matrix', false, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, {'role': 'admin', 'firstName': 'Alex'})).toEqual(';id=role,admin,firstName,Alex');
		s = getParameterSerializationOptions('matrix', true, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, {'role': 'admin', 'firstName': 'Alex'})).toEqual(';role=admin;firstName=Alex');
	});
	it(`should serialize 'form' styles`, () => {
		const name = 'id';
		let s = getParameterSerializationOptions('form', false, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, 5)).toEqual('?id=5');
		s = getParameterSerializationOptions('form', true, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, 5)).toEqual('?id=5');
		s = getParameterSerializationOptions('form', false, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, [3, 4, 5])).toEqual('?id=3,4,5');
		s = getParameterSerializationOptions('form', true, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, [3, 4, 5])).toEqual('?id=3&id=4&id=5');
		s = getParameterSerializationOptions('form', false, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, {'role': 'admin', 'firstName': 'Alex'})).toEqual('?id=role,admin,firstName,Alex');
		s = getParameterSerializationOptions('form', true, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, {'role': 'admin', 'firstName': 'Alex'})).toEqual('?role=admin&firstName=Alex');
	});
	it(`should serialize 'spaceDelimited' styles`, () => {
		const name = 'id';
		let s = getParameterSerializationOptions('spaceDelimited', false, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, [3, 4, 5])).toEqual('?id=3%204%205');
		s = getParameterSerializationOptions('spaceDelimited', true, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, [3, 4, 5])).toEqual('?id=3&id=4&id=5');
	});
	it(`should serialize 'pipeDelimited' styles`, () => {
		const name = 'id';
		let s = getParameterSerializationOptions('pipeDelimited', false, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, [3, 4, 5])).toEqual('?id=3|4|5');
		s = getParameterSerializationOptions('pipeDelimited', true, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, [3, 4, 5])).toEqual('?id=3&id=4&id=5');
	});
	it(`should serialize 'deepObject' styles`, () => {
		const name = 'id';
		let s = getParameterSerializationOptions('deepObject', true, name);
		expect(stringifyRequestParameter(s.operator, s.identifier, s.delimiter, s.separator, {'role': 'admin', 'firstName': 'Alex'})).toEqual('?id[role]=admin&id[firstName]=Alex');
	});
});
