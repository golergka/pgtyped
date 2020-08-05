import * as queryModule from '@pgtyped/query';
import { parseSQLFile, parseTypeScriptFile } from '@pgtyped/query';
import { IQueryTypes } from '@pgtyped/query/lib/actions';
import { generateInterface, queryToTypeDeclarations } from './generator';
import { ProcessingMode } from './index';
import { DefaultTypeMapping, TypeAllocator } from './types';
import { ParsedConfig } from './config';

const getTypesMocked = jest.spyOn(queryModule, 'getTypes').mockName('getTypes');

function parsedQuery(
  mode: ProcessingMode,
  queryString: string,
): Parameters<typeof queryToTypeDeclarations>[0] {
  return mode === ProcessingMode.SQL
    ? { mode, ast: parseSQLFile(queryString).queries[0] }
    : { mode, ast: parseTypeScriptFile(queryString).queries[0] };
}

describe('query-to-interface translation', () => {
  [ProcessingMode.SQL, ProcessingMode.TS].forEach((mode) => {
    test(`TypeMapping and declarations (${mode})`, async () => {
      const queryStringSQL = `
    /* @name GetNotifications */
    SELECT payload, type FROM notifications WHERE id = :userId;
    `;
      const queryStringTS = `
      const getNotifications = sql\`SELECT payload, type FROM notifications WHERE id = $userId\`;
      `;
      const queryString =
        mode === ProcessingMode.SQL ? queryStringSQL : queryStringTS;
      const mockTypes: IQueryTypes = {
        returnTypes: [
          {
            returnName: 'payload',
            columnName: 'payload',
            type: 'json',
            nullable: false,
          },
          {
            returnName: 'type',
            columnName: 'type',
            type: { name: 'PayloadType', enumValues: ['message', 'dynamite'] },
            nullable: false,
          },
        ],
        paramMetadata: {
          params: ['uuid'],
          mapping: [
            {
              name: 'id',
              type: queryModule.ParamTransform.Scalar,
              assignedIndex: 1,
            },
          ],
        },
      };
      getTypesMocked.mockResolvedValue(mockTypes);
      const types = new TypeAllocator(DefaultTypeMapping);
      // Test out imports
      types.use({ name: 'PreparedQuery', from: '@pgtyped/query' });
      const result = await queryToTypeDeclarations(
        parsedQuery(mode, queryString),
        null,
        types,
        {} as ParsedConfig,
      );
      const expectedTypes = `import { PreparedQuery } from '@pgtyped/query';

export type PayloadType = 'message' | 'dynamite';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };\n`;

      expect(types.declaration()).toEqual(expectedTypes);
      const expected = `/** 'GetNotifications' parameters type */
export interface IGetNotificationsParams {
  id: string | null | void;
}

/** 'GetNotifications' return type */
export interface IGetNotificationsResult {
  payload: Json;
  type: PayloadType;
}

/** 'GetNotifications' query type */
export interface IGetNotificationsQuery {
  params: IGetNotificationsParams;
  result: IGetNotificationsResult;
}\n\n`;
      expect(result).toEqual(expected);
    });

    test(`Insert notification query (${mode})`, async () => {
      const queryStringSQL = `
    /*
      @name InsertNotifications
      @param notification -> (payload, user_id, type)
    */
    INSERT INTO notifications (payload, user_id, type) VALUES :notification
    `;
      const queryStringTS = `const insertNotifications = sql\`INSERT INTO notifications (payload, user_id, type) VALUES $notification(payload, user_id, type)\`;`;
      const queryString =
        mode === ProcessingMode.SQL ? queryStringSQL : queryStringTS;
      const mockTypes: IQueryTypes = {
        returnTypes: [],
        paramMetadata: {
          params: ['json', 'uuid', 'text'],
          mapping: [
            {
              name: 'notification',
              type: queryModule.ParamTransform.Pick,
              dict: {
                payload: {
                  name: 'payload',
                  assignedIndex: 1,
                  type: queryModule.ParamTransform.Scalar,
                },
                user_id: {
                  name: 'user_id',
                  assignedIndex: 2,
                  type: queryModule.ParamTransform.Scalar,
                },
                type: {
                  name: 'type',
                  assignedIndex: 3,
                  type: queryModule.ParamTransform.Scalar,
                },
              },
            },
          ],
        },
      };
      const types = new TypeAllocator(DefaultTypeMapping);
      getTypesMocked.mockResolvedValue(mockTypes);
      const result = await queryToTypeDeclarations(
        parsedQuery(mode, queryString),
        null,
        types,
        {} as ParsedConfig,
      );
      expect(result).toMatchSnapshot();
    });

    test(`DeleteUsers by UUID (${mode})`, async () => {
      const queryStringSQL = `
    /* @name DeleteUsers */
      delete from users * where name = :userName and id = :userId and note = :userNote returning id, id, name, note as bote;
    `;
      const queryStringTS = `const deleteUsers = sql\`delete from users * where name = $userName and id = $userId and note = $userNote returning id, id, name, note as bote\``;
      const queryString =
        mode === ProcessingMode.SQL ? queryStringSQL : queryStringTS;
      const mockTypes: IQueryTypes = {
        returnTypes: [
          {
            returnName: 'id',
            columnName: 'id',
            type: 'uuid',
            nullable: false,
          },
          {
            returnName: 'name',
            columnName: 'name',
            type: 'text',
            nullable: false,
          },
          {
            returnName: 'bote',
            columnName: 'note',
            type: 'text',
            nullable: true,
          },
        ],
        paramMetadata: {
          params: ['uuid', 'text'],
          mapping: [
            {
              name: 'id',
              type: queryModule.ParamTransform.Scalar,
              assignedIndex: 1,
            },
            {
              name: 'userName',
              type: queryModule.ParamTransform.Scalar,
              assignedIndex: 2,
            },
          ],
        },
      };
      const types = new TypeAllocator(DefaultTypeMapping);
      getTypesMocked.mockResolvedValue(mockTypes);
      const result = await queryToTypeDeclarations(
        parsedQuery(mode, queryString),
        null,
        types,
        {} as ParsedConfig,
      );
      const expected = `/** 'DeleteUsers' parameters type */
export interface IDeleteUsersParams {
  id: string | null | void;
  userName: string | null | void;
}

/** 'DeleteUsers' return type */
export interface IDeleteUsersResult {
  id: string;
  name: string;
  bote: string | null;
}

/** 'DeleteUsers' query type */
export interface IDeleteUsersQuery {
  params: IDeleteUsersParams;
  result: IDeleteUsersResult;
}

`;
      expect(result).toEqual(expected);
    });

    test(`TypeMapping and declarations camelCase (${mode})`, async () => {
      const queryStringSQL = `
    /* @name GetNotifications */
    SELECT payload, type FROM notifications WHERE id = :userId;
    `;
      const queryStringTS = `
      const getNotifications = sql\`SELECT payload, type FROM notifications WHERE id = $userId\`;
      `;
      const queryString =
        mode === ProcessingMode.SQL ? queryStringSQL : queryStringTS;
      const mockTypes: IQueryTypes = {
        returnTypes: [
          {
            returnName: 'payload_camel_case',
            columnName: 'payload',
            type: 'json',
            nullable: false,
          },
          {
            returnName: 'type_camel_case',
            columnName: 'type',
            type: { name: 'PayloadType', enumValues: ['message', 'dynamite'] },
            nullable: false,
          },
        ],
        paramMetadata: {
          params: ['uuid'],
          mapping: [
            {
              name: 'id',
              type: queryModule.ParamTransform.Scalar,
              assignedIndex: 1,
            },
          ],
        },
      };
      getTypesMocked.mockResolvedValue(mockTypes);
      const types = new TypeAllocator(DefaultTypeMapping);
      // Test out imports
      types.use({ name: 'PreparedQuery', from: '@pgtyped/query' });
      const result = await queryToTypeDeclarations(
        parsedQuery(mode, queryString),
        null,
        types,
        { camelCaseColumnNames: true } as ParsedConfig,
      );
      const expectedTypes = `import { PreparedQuery } from '@pgtyped/query';

export type PayloadType = 'message' | 'dynamite';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };\n`;

      expect(types.declaration()).toEqual(expectedTypes);
      const expected = `/** 'GetNotifications' parameters type */
export interface IGetNotificationsParams {
  id: string | null | void;
}

/** 'GetNotifications' return type */
export interface IGetNotificationsResult {
  payloadCamelCase: Json;
  typeCamelCase: PayloadType;
}

/** 'GetNotifications' query type */
export interface IGetNotificationsQuery {
  params: IGetNotificationsParams;
  result: IGetNotificationsResult;
}\n\n`;
      expect(result).toEqual(expected);
    });

    test(`Columns without nullable info should be nullable (${mode})`, async () => {
      const queryStringSQL = `
    /* @name GetNotifications */
    SELECT payload, type FROM notifications WHERE id = :userId;
    `;
      const queryStringTS = `
      const getNotifications = sql\`SELECT payload, type FROM notifications WHERE id = $userId\`;
      `;
      const queryString =
        mode === ProcessingMode.SQL ? queryStringSQL : queryStringTS;
      const mockTypes: IQueryTypes = {
        returnTypes: [
          {
            returnName: 'payload',
            columnName: 'payload',
            type: 'json',
          },
          {
            returnName: 'type',
            columnName: 'type',
            type: { name: 'PayloadType', enumValues: ['message', 'dynamite'] },
            nullable: false,
          },
        ],
        paramMetadata: {
          params: ['uuid'],
          mapping: [
            {
              name: 'id',
              type: queryModule.ParamTransform.Scalar,
              assignedIndex: 1,
            },
          ],
        },
      };
      getTypesMocked.mockResolvedValue(mockTypes);
      const types = new TypeAllocator(DefaultTypeMapping);
      // Test out imports
      types.use({ name: 'PreparedQuery', from: '@pgtyped/query' });
      const result = await queryToTypeDeclarations(
        parsedQuery(mode, queryString),
        null,
        types,
        {} as ParsedConfig,
      );
      const expectedTypes = `import { PreparedQuery } from '@pgtyped/query';

export type PayloadType = 'message' | 'dynamite';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };\n`;

      expect(types.declaration()).toEqual(expectedTypes);
      const expected = `/** 'GetNotifications' parameters type */
export interface IGetNotificationsParams {
  id: string | null | void;
}

/** 'GetNotifications' return type */
export interface IGetNotificationsResult {
  payload: Json | null;
  type: PayloadType;
}

/** 'GetNotifications' query type */
export interface IGetNotificationsQuery {
  params: IGetNotificationsParams;
  result: IGetNotificationsResult;
}\n\n`;
      expect(result).toEqual(expected);
    });

    test(`Fixed-length character type (${mode})`, async () => {
      const queryStringSQL = `
      /* @name GetCountry */
      SELECT iso FROM countries WHERE id = :countryId;
      `;
      const queryStringTS = `
      const getCountry = sql\`SELECT iso FROM countries WHERE id = $countryId\`;
      `;
      const queryString =
        mode === ProcessingMode.SQL ? queryStringSQL : queryStringTS;
      const mockTypes: IQueryTypes = {
        returnTypes: [
          {
            returnName: 'iso',
            columnName: 'iso',
            type: 'character(3)',
            nullable: false,
          },
        ],
        paramMetadata: {
          params: ['uuid'],
          mapping: [
            {
              name: 'id',
              type: queryModule.ParamTransform.Scalar,
              assignedIndex: 1,
            },
          ],
        },
      };
      getTypesMocked.mockResolvedValue(mockTypes);
      const types = new TypeAllocator(DefaultTypeMapping);
      // Test out imports
      types.use({ name: 'PreparedQuery', from: '@pgtyped/query' });
      const result = await queryToTypeDeclarations(
        parsedQuery(mode, queryString),
        null,
        types,
        {} as ParsedConfig,
      );
      const expected = `/** 'GetCountry' parameters type */
export interface IGetCountryParams {
  id: string | null | void;
}

/** 'GetCountry' return type */
export interface IGetCountryResult {
  iso: string
}

/** 'GetCountry' query type */
export interface IGetCountryQuery {
  params: IGetCountryParams;
  result: IGetCountryResult;
}\n\n`;
      expect(result).toEqual(expected);
    });
  });
});

test('interface generation', () => {
  const expected = `export interface User {
  name: string;
  age: number;
}

`;
  const fields = [
    {
      fieldName: 'name',
      fieldType: 'string',
    },
    {
      fieldName: 'age',
      fieldType: 'number',
    },
  ];
  const result = generateInterface('User', fields);
  expect(result).toEqual(expected);
});
