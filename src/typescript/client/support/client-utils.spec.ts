import {ParamSerializers} from './client-utils';

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
		expect(ParamSerializers.s(name, 5)).toEqual('5');
		expect(ParamSerializers.se(name, 5)).toEqual('5');
		expect(ParamSerializers.s(name, [3, 4, 5])).toEqual('3,4,5');
		expect(ParamSerializers.se(name, [3, 4, 5])).toEqual('3,4,5');
		expect(ParamSerializers.s(name, {'role': 'admin', 'firstName': 'Alex'})).toEqual('role,admin,firstName,Alex');
		expect(ParamSerializers.se(name, {'role': 'admin', 'firstName': 'Alex'})).toEqual('role=admin,firstName=Alex');
	});
	it(`should serialize 'label' styles`, () => {
		const name = 'id';
		expect(ParamSerializers.l(name, 5)).toEqual('.5');
		expect(ParamSerializers.le(name, 5)).toEqual('.5');
		expect(ParamSerializers.l(name, [3, 4, 5])).toEqual('.3.4.5');
		expect(ParamSerializers.le(name, [3, 4, 5])).toEqual('.3.4.5');
		expect(ParamSerializers.l(name, {'role': 'admin', 'firstName': 'Alex'})).toEqual('.role.admin.firstName.Alex');
		expect(ParamSerializers.le(name, {'role': 'admin', 'firstName': 'Alex'})).toEqual('.role=admin.firstName=Alex');
	});
	it(`should serialize 'matrix' styles`, () => {
		const name = 'id';
		expect(ParamSerializers.m(name, 5)).toEqual(';id=5');
		expect(ParamSerializers.me(name, 5)).toEqual(';id=5');
		expect(ParamSerializers.m(name, [3, 4, 5])).toEqual(';id=3,4,5');
		expect(ParamSerializers.me(name, [3, 4, 5])).toEqual(';id=3;id=4;id=5');
		expect(ParamSerializers.m(name, {'role': 'admin', 'firstName': 'Alex'})).toEqual(';id=role,admin,firstName,Alex');
		expect(ParamSerializers.me(name, {'role': 'admin', 'firstName': 'Alex'})).toEqual(';role=admin;firstName=Alex');
	});
	it(`should serialize 'form' styles`, () => {
		const name = 'id';
		expect(ParamSerializers.f(name, 5)).toEqual('id=5');
		expect(ParamSerializers.fe(name, 5)).toEqual('id=5');
		expect(ParamSerializers.f(name, [3, 4, 5])).toEqual('id=3,4,5');
		expect(ParamSerializers.fe(name, [3, 4, 5])).toEqual('id=3&id=4&id=5');
		expect(ParamSerializers.f(name, {'role': 'admin', 'firstName': 'Alex'})).toEqual('id=role,admin,firstName,Alex');
		expect(ParamSerializers.fe(name, {'role': 'admin', 'firstName': 'Alex'})).toEqual('role=admin&firstName=Alex');
	});
	it(`should serialize 'spaceDelimited' styles`, () => {
		const name = 'id';
		expect(ParamSerializers.sd(name, [3, 4, 5])).toEqual('3 4 5');
	});
	it(`should serialize 'pipeDelimited' styles`, () => {
		const name = 'id';
		expect(ParamSerializers.pd(name, [3, 4, 5])).toEqual('3|4|5');
	});
	it(`should serialize 'deepObject' styles`, () => {
		const name = 'id';
		expect(ParamSerializers.do(name, {'role': 'admin', 'firstName': 'Alex'})).toEqual('id[role]=admin&id[firstName]=Alex');
	});
});
